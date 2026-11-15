import { NextResponse, type NextRequest } from "next/server";
import { consumeOAuth } from "@/lib/oauth-state";
import { getOrCreateUser } from "@/lib/session";
import { saveTokens } from "@/lib/tokens";
import { exchangeWhoopCode, fetchWhoopProfile } from "@/lib/whoop/client";
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
      params.get("error_description") ?? `WHOOP returned: ${providerError}`,
      false,
    );
  }

  const code = params.get("code");
  if (!code) return back("WHOOP did not return an authorization code.", false);

  try {
    await consumeOAuth("whoop", params.get("state"));

    const tokens = await exchangeWhoopCode(code);
    const user = await getOrCreateUser();

    await saveTokens(user.id, "whoop", {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresIn: tokens.expires_in ?? null,
      scope: tokens.scope ?? null,
    });

    // Best-effort: label the account with the WHOOP profile name.
    try {
      const profile = await fetchWhoopProfile(user.id);
      const name = [profile.first_name, profile.last_name]
        .filter(Boolean)
        .join(" ");
      if (name) {
        const { prisma } = await import("@/lib/db");
        await prisma.providerAccount.update({
          where: { userId_provider: { userId: user.id, provider: "whoop" } },
          data: { providerAccountId: String(profile.user_id) },
        });
        if (!user.displayName) {
          await prisma.user.update({
            where: { id: user.id },
            data: { displayName: name },
          });
        }
      }
    } catch {
      // A profile lookup failure should not block a successful connection.
    }

    return back("WHOOP connected", true);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not connect WHOOP.";
    return back(message, false);
  }
}
