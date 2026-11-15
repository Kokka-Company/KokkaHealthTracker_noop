import crypto from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { env } from "./env";
import { safeEqual } from "./crypto";

/**
 * Minimal signed-cookie session.
 *
 * This app is meant to be self-hosted for a single person, so there is no
 * password or identity provider — the first connected account creates the User
 * row, and a signed cookie ties the browser to it. If this ever becomes
 * multi-tenant, swap this file for a real auth provider; nothing else depends
 * on the mechanism.
 */

const COOKIE_NAME = "kht_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function sign(value: string): string {
  return crypto
    .createHmac("sha256", env().SESSION_SECRET)
    .update(value)
    .digest("base64url");
}

function serialize(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

function deserialize(raw: string): string | null {
  const idx = raw.lastIndexOf(".");
  if (idx <= 0) return null;

  const userId = raw.slice(0, idx);
  const signature = raw.slice(idx + 1);
  if (!safeEqual(signature, sign(userId))) return null;

  return userId;
}

/** The signed-in user's id, or null. Does not touch the database. */
export async function getSessionUserId(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE_NAME)?.value;
  return raw ? deserialize(raw) : null;
}

/** The signed-in User row, or null if the cookie is absent or stale. */
export async function getCurrentUser() {
  const userId = await getSessionUserId();
  if (!userId) return null;

  return prisma.user.findUnique({
    where: { id: userId },
    include: { accounts: true },
  });
}

export async function setSessionCookie(userId: string): Promise<void> {
  (await cookies()).set(COOKIE_NAME, serialize(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: env().APP_URL.startsWith("https://"),
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

/**
 * Returns the current user, creating one if this is a first connection.
 * Called from OAuth callbacks so that connecting either provider works as the
 * initial sign-in.
 */
export async function getOrCreateUser(displayName?: string) {
  const existingId = await getSessionUserId();
  if (existingId) {
    const existing = await prisma.user.findUnique({ where: { id: existingId } });
    if (existing) return existing;
  }

  // A self-hosted instance should converge on one user rather than orphaning
  // data behind a cleared cookie.
  const firstUser = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (firstUser) {
    await setSessionCookie(firstUser.id);
    return firstUser;
  }

  const created = await prisma.user.create({
    data: {
      displayName: displayName ?? null,
      timezone: process.env.TZ || "UTC",
    },
  });
  await setSessionCookie(created.id);
  return created;
}
