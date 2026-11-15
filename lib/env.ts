import { z } from "zod";

/**
 * Server-side environment. Validated lazily so that `next build` and the
 * "connect your accounts" screens still work before every provider has been
 * configured — only the code paths that actually need a credential throw.
 */
const schema = z.object({
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  ENCRYPTION_KEY: z.string().min(1),
  SESSION_SECRET: z.string().min(1),

  WHOOP_CLIENT_ID: z.string().optional(),
  WHOOP_CLIENT_SECRET: z.string().optional(),

  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_TENANT_ID: z.string().default("common"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `Invalid or missing environment variables: ${missing}. ` +
        `Copy .env.example to .env and fill it in.`,
    );
  }

  cached = parsed.data;
  return cached;
}

/** True when the WHOOP OAuth app has been configured. */
export function whoopConfigured(): boolean {
  return Boolean(process.env.WHOOP_CLIENT_ID && process.env.WHOOP_CLIENT_SECRET);
}

/** True when the Microsoft/Entra app registration has been configured. */
export function microsoftConfigured(): boolean {
  return Boolean(
    process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET,
  );
}

export function requireWhoopCredentials(): {
  clientId: string;
  clientSecret: string;
} {
  const { WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET } = env();
  if (!WHOOP_CLIENT_ID || !WHOOP_CLIENT_SECRET) {
    throw new Error(
      "WHOOP is not configured. Set WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET in .env",
    );
  }
  return { clientId: WHOOP_CLIENT_ID, clientSecret: WHOOP_CLIENT_SECRET };
}

export function requireMicrosoftCredentials(): {
  clientId: string;
  clientSecret: string;
  tenantId: string;
} {
  const { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TENANT_ID } =
    env();
  if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
    throw new Error(
      "Microsoft is not configured. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET in .env",
    );
  }
  return {
    clientId: MICROSOFT_CLIENT_ID,
    clientSecret: MICROSOFT_CLIENT_SECRET,
    tenantId: MICROSOFT_TENANT_ID,
  };
}
