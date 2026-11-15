import { NextResponse, type NextRequest } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { disconnect, type Provider } from "@/lib/tokens";
import { env } from "@/lib/env";

const PROVIDERS: Provider[] = ["whoop", "microsoft"];

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const form = await request.formData();
  const provider = String(form.get("provider") ?? "");

  if (!PROVIDERS.includes(provider as Provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  await disconnect(userId, provider as Provider);

  return NextResponse.redirect(
    `${env().APP_URL}/?connected=${encodeURIComponent(`${provider} disconnected`)}`,
    { status: 303 },
  );
}
