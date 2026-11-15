import crypto from "node:crypto";
import { env } from "./env";

/**
 * AES-256-GCM encryption for OAuth tokens at rest.
 *
 * Health data is about as sensitive as it gets, so refresh tokens never sit in
 * the database in plaintext. Ciphertext format is `v1.<iv>.<tag>.<payload>`,
 * all base64url — the version prefix leaves room to rotate the scheme later.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const VERSION = "v1";

function key(): Buffer {
  const raw = Buffer.from(env().ENCRYPTION_KEY, "base64");
  if (raw.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY must be 32 bytes, base64-encoded. Generate one with: openssl rand -base64 32",
    );
  }
  return raw;
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  const payload = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    payload.toString("base64url"),
  ].join(".");
}

export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Malformed ciphertext");
  }

  const [, ivB64, tagB64, payloadB64] = parts;
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key(),
    Buffer.from(ivB64, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(payloadB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Constant-time string comparison, for signature checks. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
