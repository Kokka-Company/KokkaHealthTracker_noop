import crypto from "node:crypto";
import { cookies } from "next/headers";
import { env } from "./env";

/**
 * Short-lived cookies carrying the OAuth `state` (CSRF defence) and the PKCE
 * verifier across the redirect to the provider and back.
 */

const MAX_AGE_SECONDS = 60 * 10;

function stateCookie(provider: string) {
  return `kht_oauth_state_${provider}`;
}

function verifierCookie(provider: string) {
  return `kht_oauth_verifier_${provider}`;
}

export type PkcePair = { verifier: string; challenge: string };

export function createPkcePair(): PkcePair {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

export async function beginOAuth(
  provider: string,
): Promise<{ state: string; pkce: PkcePair }> {
  const state = crypto.randomBytes(16).toString("base64url");
  const pkce = createPkcePair();

  const jar = await cookies();
  const options = {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: env().APP_URL.startsWith("https://"),
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  };

  jar.set(stateCookie(provider), state, options);
  jar.set(verifierCookie(provider), pkce.verifier, options);

  return { state, pkce };
}

/**
 * Validates the returned `state` and hands back the PKCE verifier.
 * Throws if the state is missing or does not match — that means the callback
 * did not originate from a flow this browser started.
 */
export async function consumeOAuth(
  provider: string,
  returnedState: string | null,
): Promise<{ verifier: string }> {
  const jar = await cookies();
  const expectedState = jar.get(stateCookie(provider))?.value;
  const verifier = jar.get(verifierCookie(provider))?.value;

  jar.delete(stateCookie(provider));
  jar.delete(verifierCookie(provider));

  if (!expectedState || !returnedState || expectedState !== returnedState) {
    throw new Error("OAuth state mismatch — please start the connection again.");
  }
  if (!verifier) {
    throw new Error("Missing PKCE verifier — please start the connection again.");
  }

  return { verifier };
}
