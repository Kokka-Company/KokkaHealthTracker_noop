import { prisma } from "./db";
import { encrypt, decrypt } from "./crypto";

export type Provider = "whoop" | "microsoft";

export type TokenSet = {
  accessToken: string;
  refreshToken?: string | null;
  /** Seconds until the access token expires, as returned by the provider. */
  expiresIn?: number | null;
  scope?: string | null;
  providerAccountId?: string | null;
};

/** Persist a token set, encrypting both tokens at rest. */
export async function saveTokens(
  userId: string,
  provider: Provider,
  tokens: TokenSet,
): Promise<void> {
  const expiresAt = tokens.expiresIn
    ? new Date(Date.now() + tokens.expiresIn * 1000)
    : null;

  const data = {
    accessToken: encrypt(tokens.accessToken),
    refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
    expiresAt,
    scope: tokens.scope ?? null,
    providerAccountId: tokens.providerAccountId ?? null,
  };

  await prisma.providerAccount.upsert({
    where: { userId_provider: { userId, provider } },
    create: { userId, provider, ...data },
    update: {
      ...data,
      // Some providers omit the refresh token on refresh — keep the old one.
      refreshToken: data.refreshToken ?? undefined,
    },
  });
}

export type StoredAccount = {
  provider: Provider;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
};

/** Load and decrypt a provider account, or null if it is not connected. */
export async function getAccount(
  userId: string,
  provider: Provider,
): Promise<StoredAccount | null> {
  const row = await prisma.providerAccount.findUnique({
    where: { userId_provider: { userId, provider } },
  });
  if (!row) return null;

  return {
    provider,
    accessToken: decrypt(row.accessToken),
    refreshToken: row.refreshToken ? decrypt(row.refreshToken) : null,
    expiresAt: row.expiresAt,
    scope: row.scope,
  };
}

export async function disconnect(
  userId: string,
  provider: Provider,
): Promise<void> {
  await prisma.providerAccount
    .delete({ where: { userId_provider: { userId, provider } } })
    .catch(() => undefined);
}

/** True when the token is missing an expiry, or expires within 60 seconds. */
export function isExpired(account: StoredAccount): boolean {
  if (!account.expiresAt) return false;
  return account.expiresAt.getTime() - Date.now() < 60_000;
}
