import { env, requireMicrosoftCredentials } from "../env";
import { getAccount, saveTokens, isExpired } from "../tokens";
import { summarizeDay } from "./summarize";
import type { CalendarEvent, CalendarDay } from "./types";

/**
 * Microsoft Graph calendar integration.
 * Docs: https://learn.microsoft.com/graph/api/user-list-calendarview
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export const MICROSOFT_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "User.Read",
  "Calendars.Read",
];

function authorityBase(): string {
  const { tenantId } = requireMicrosoftCredentials();
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0`;
}

export function microsoftRedirectUri(): string {
  return `${env().APP_URL}/api/auth/microsoft/callback`;
}

export function buildMicrosoftAuthorizeUrl(
  state: string,
  codeChallenge: string,
): string {
  const { clientId } = requireMicrosoftCredentials();

  const url = new URL(`${authorityBase()}/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", microsoftRedirectUri());
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", MICROSOFT_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

type MicrosoftTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type: string;
};

async function postToken(
  body: URLSearchParams,
): Promise<MicrosoftTokenResponse> {
  const response = await fetch(`${authorityBase()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Microsoft token request failed (${response.status}): ${detail.slice(0, 300)}`,
    );
  }

  return (await response.json()) as MicrosoftTokenResponse;
}

export async function exchangeMicrosoftCode(
  code: string,
  codeVerifier: string,
) {
  const { clientId, clientSecret } = requireMicrosoftCredentials();

  return postToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: microsoftRedirectUri(),
      code_verifier: codeVerifier,
      scope: MICROSOFT_SCOPES.join(" "),
    }),
  );
}

async function refreshMicrosoftToken(refreshToken: string) {
  const { clientId, clientSecret } = requireMicrosoftCredentials();

  return postToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      scope: MICROSOFT_SCOPES.join(" "),
    }),
  );
}

export class MicrosoftAuthError extends Error {}

async function getFreshAccessToken(userId: string): Promise<string> {
  const account = await getAccount(userId, "microsoft");
  if (!account) throw new MicrosoftAuthError("Microsoft is not connected.");

  if (!isExpired(account)) return account.accessToken;

  if (!account.refreshToken) {
    throw new MicrosoftAuthError(
      "Microsoft access token expired with no refresh token. Reconnect your calendar.",
    );
  }

  const refreshed = await refreshMicrosoftToken(account.refreshToken);
  await saveTokens(userId, "microsoft", {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? account.refreshToken,
    expiresIn: refreshed.expires_in ?? null,
    scope: refreshed.scope ?? account.scope,
  });

  return refreshed.access_token;
}

async function graphFetch<T>(
  userId: string,
  path: string,
  params?: Record<string, string>,
  timezone = "UTC",
): Promise<T> {
  const token = await getFreshAccessToken(userId);

  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      // Ask Graph to return start/end already converted to the user's zone.
      Prefer: `outlook.timezone="${timezone}"`,
    },
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new MicrosoftAuthError(
      "Microsoft rejected the access token. Reconnect your calendar.",
    );
  }
  if (response.status === 429) {
    throw new Error("Microsoft Graph rate limit reached. Try again shortly.");
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Graph ${path} failed (${response.status}): ${detail.slice(0, 300)}`,
    );
  }

  return (await response.json()) as T;
}

export async function fetchMicrosoftProfile(userId: string) {
  return graphFetch<{ id: string; displayName?: string; mail?: string }>(
    userId,
    "/me",
  );
}

type GraphEvent = {
  id: string;
  subject?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isAllDay?: boolean;
  showAs?: string;
  isCancelled?: boolean;
  isOnlineMeeting?: boolean;
  location?: { displayName?: string };
  organizer?: { emailAddress?: { name?: string; address?: string } };
  attendees?: unknown[];
};

/**
 * Graph returns naive local datetimes plus a separate timeZone field. When we
 * send the `Prefer: outlook.timezone` header those are already in the user's
 * zone, so append the offset we know rather than letting `new Date()` guess.
 */
function toIso(dt: { dateTime: string; timeZone: string }): string {
  const raw = dt.dateTime;
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)) return new Date(raw).toISOString();
  // Graph emits UTC-normalised values when timeZone is UTC.
  if (dt.timeZone?.toUpperCase() === "UTC") {
    return new Date(`${raw}Z`).toISOString();
  }
  return new Date(raw).toISOString();
}

function normalize(event: GraphEvent): CalendarEvent {
  return {
    id: event.id,
    title: event.subject?.trim() || "(no title)",
    start: toIso(event.start),
    end: toIso(event.end),
    isAllDay: Boolean(event.isAllDay),
    showAs: event.showAs ?? "unknown",
    isOnline: Boolean(event.isOnlineMeeting),
    location: event.location?.displayName || null,
    organizer: event.organizer?.emailAddress?.name ?? null,
    attendeeCount: Array.isArray(event.attendees) ? event.attendees.length : 0,
    isCancelled: Boolean(event.isCancelled),
  };
}

/**
 * Events for a single day. `calendarView` (rather than `/events`) is what
 * expands recurring series into concrete instances.
 */
export async function fetchCalendarDay(
  userId: string,
  dayStart: Date,
  dayEnd: Date,
  timezone = "UTC",
): Promise<CalendarDay> {
  const data = await graphFetch<{ value: GraphEvent[] }>(
    userId,
    "/me/calendarView",
    {
      startDateTime: dayStart.toISOString(),
      endDateTime: dayEnd.toISOString(),
      $select:
        "id,subject,start,end,isAllDay,showAs,isCancelled,isOnlineMeeting,location,organizer,attendees",
      $orderby: "start/dateTime",
      $top: "100",
    },
    timezone,
  );

  const events = (data.value ?? [])
    .map(normalize)
    .filter((e) => !e.isCancelled)
    .sort((a, b) => a.start.localeCompare(b.start));

  return summarizeDay(events);
}

export { summarizeDay };
