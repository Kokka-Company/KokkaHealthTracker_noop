import { NextResponse } from "next/server";
import { beginOAuth } from "@/lib/oauth-state";
import { buildMicrosoftAuthorizeUrl } from "@/lib/calendar/microsoft";
import { env, microsoftConfigured } from "@/lib/env";

/** Kicks off the Microsoft Graph OAuth flow. */
export async function GET() {
  if (!microsoftConfigured()) {
    return NextResponse.redirect(
      `${env().APP_URL}/?error=${encodeURIComponent(
        "Microsoft is not configured. Add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET to .env",
      )}`,
    );
  }

  const { state, pkce } = await beginOAuth("microsoft");
  return NextResponse.redirect(
    buildMicrosoftAuthorizeUrl(state, pkce.challenge),
  );
}
