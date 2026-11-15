import { NextResponse } from "next/server";
import { beginOAuth } from "@/lib/oauth-state";
import { buildWhoopAuthorizeUrl } from "@/lib/whoop/client";
import { env, whoopConfigured } from "@/lib/env";

/** Kicks off the WHOOP OAuth flow. */
export async function GET() {
  if (!whoopConfigured()) {
    return NextResponse.redirect(
      `${env().APP_URL}/?error=${encodeURIComponent(
        "WHOOP is not configured. Add WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET to .env",
      )}`,
    );
  }

  const { state } = await beginOAuth("whoop");
  return NextResponse.redirect(buildWhoopAuthorizeUrl(state));
}
