import { NextResponse, type NextRequest } from "next/server";
import { consumeOAuth } from "@/lib/oauth-state";
import { getOrCreateUser } from "@/lib/session";
import { saveTokens } from "@/lib/tokens";
import {
  exchangeMicrosoftCode,
  fetchMicrosoftProfile,
} from "@/lib/calendar/microsoft";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

function back(message: string, ok: boolean) {
  const key = ok ? "connected" : "error";
  return NextResponse.redirect(
    `${env().APP_URL}/?${key}=${encodeURIComponent(message)}`,
  );
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const providerError = params.get("error");
  if (providerError) {
    return back(
      params.get("error_description") ?? `Microsoft returned: ${providerError}`,
      false,
    );
  }

  const code = params.get("code");
  if (!code) {
    return back("Microsoft did not return an authorization code.", false);
  }

  try {
    const { verifier } = await consumeOAuth("microsoft", params.get("state"));

    const tokens = await exchangeMicrosoftCode(code, verifier);
    const user = await getOrCreateUser();

    await saveTokens(user.id, "microsoft", {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresIn: tokens.expires_in ?? null,
      scope: tokens.scope ?? null,
    });

    try {
      const profile = await fetchMicrosoftProfile(user.id);
      await prisma.providerAccount.update({
        where: { userId_provider: { userId: user.id, provider: "microsoft" } },
        data: { providerAccountId: profile.id },
      });
      if (!user.displayName && profile.displayName) {
        await prisma.user.update({
          where: { id: user.id },
          data: { displayName: profile.displayName },
        });
      }
    } catch {
      // Profile lookup is decorative — never fail the connection over it.
    }

    return back("Calendar connected", true);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not connect calendar.";
    return back(message, false);
  }
}
