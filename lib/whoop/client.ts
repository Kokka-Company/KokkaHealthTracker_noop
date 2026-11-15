import { env, requireWhoopCredentials } from "../env";
import {
  getAccount,
  saveTokens,
  isExpired,
  type StoredAccount,
} from "../tokens";
import type {
  WhoopCollection,
  WhoopCycle,
  WhoopProfile,
  WhoopRecovery,
  WhoopSleep,
} from "./types";

/**
 * WHOOP API v2 client.
 * Docs: https://developer.whoop.com/api  (v1 was retired in October 2025)
 */

export const WHOOP_AUTHORIZE_URL =
  "https://api.prod.whoop.com/oauth/oauth2/auth";
export const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
export const WHOOP_API_BASE = "https://api.prod.whoop.com/developer/v2";

/** `offline` is what gets us a refresh token — without it the link dies in an hour. */
export const WHOOP_SCOPES = [
  "read:recovery",
  "read:sleep",
  "read:cycles",
  "read:profile",
  "offline",
];

export function whoopRedirectUri(): string {
  return `${env().APP_URL}/api/auth/whoop/callback`;
}

export function buildWhoopAuthorizeUrl(state: string): string {
  const { clientId } = requireWhoopCredentials();

  const url = new URL(WHOOP_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", whoopRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", WHOOP_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

type WhoopTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type: string;
};

async function postToken(body: URLSearchParams): Promise<WhoopTokenResponse> {
  const response = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `WHOOP token request failed (${response.status}): ${detail.slice(0, 300)}`,
    );
  }

  return (await response.json()) as WhoopTokenResponse;
}

export async function exchangeWhoopCode(code: string) {
  const { clientId, clientSecret } = requireWhoopCredentials();

  return postToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: whoopRedirectUri(),
    }),
  );
}

async function refreshWhoopToken(refreshToken: string) {
  const { clientId, clientSecret } = requireWhoopCredentials();

  return postToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      // WHOOP requires the scope to be restated on refresh to keep `offline`.
      scope: "offline",
    }),
  );
}

/** Thrown when the stored WHOOP grant can no longer be used. */
export class WhoopAuthError extends Error {}

/**
 * Returns a usable access token, refreshing and re-persisting it if the stored
 * one has expired.
 */
async function getFreshAccessToken(userId: string): Promise<string> {
  const account: StoredAccount | null = await getAccount(userId, "whoop");
  if (!account) throw new WhoopAuthError("WHOOP is not connected.");

  if (!isExpired(account)) return account.accessToken;

  if (!account.refreshToken) {
    throw new WhoopAuthError(
      "WHOOP access token expired and no refresh token is stored. Reconnect WHOOP.",
    );
  }

  const refreshed = await refreshWhoopToken(account.refreshToken);
  await saveTokens(userId, "whoop", {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? account.refreshToken,
    expiresIn: refreshed.expires_in ?? null,
    scope: refreshed.scope ?? account.scope,
  });

  return refreshed.access_token;
}

async function whoopFetch<T>(
  userId: string,
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const token = await getFreshAccessToken(userId);

  const url = new URL(`${WHOOP_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new WhoopAuthError("WHOOP rejected the access token. Reconnect WHOOP.");
  }
  if (response.status === 429) {
    throw new Error("WHOOP rate limit reached. Try syncing again shortly.");
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `WHOOP ${path} failed (${response.status}): ${detail.slice(0, 300)}`,
    );
  }

  return (await response.json()) as T;
}

export async function fetchWhoopProfile(userId: string) {
  return whoopFetch<WhoopProfile>(userId, "/user/profile/basic");
}

/**
 * Most recent recovery record in the window. WHOOP returns these newest-first,
 * and one shows up each morning after the night's sleep is scored.
 */
export async function fetchLatestRecovery(
  userId: string,
  start: Date,
  end: Date,
): Promise<WhoopRecovery | null> {
  const data = await whoopFetch<WhoopCollection<WhoopRecovery>>(
    userId,
    "/recovery",
    {
      start: start.toISOString(),
      end: end.toISOString(),
      limit: "10",
    },
  );

  return data.records.find((r) => r.score_state === "SCORED") ?? null;
}

/** Most recent scored main sleep (naps excluded) in the window. */
export async function fetchLatestSleep(
  userId: string,
  start: Date,
  end: Date,
): Promise<WhoopSleep | null> {
  const data = await whoopFetch<WhoopCollection<WhoopSleep>>(
    userId,
    "/activity/sleep",
    {
      start: start.toISOString(),
      end: end.toISOString(),
      limit: "10",
    },
  );

  return data.records.find((s) => s.score_state === "SCORED" && !s.nap) ?? null;
}

/** The current physiological cycle, which carries today's accumulated strain. */
export async function fetchCurrentCycle(
  userId: string,
  start: Date,
  end: Date,
): Promise<WhoopCycle | null> {
  const data = await whoopFetch<WhoopCollection<WhoopCycle>>(userId, "/cycle", {
    start: start.toISOString(),
    end: end.toISOString(),
    limit: "10",
  });

  return data.records[0] ?? null;
}
