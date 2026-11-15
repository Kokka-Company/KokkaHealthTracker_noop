import { NextResponse, type NextRequest } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { syncDay } from "@/lib/sync";
import { revalidatePath } from "next/cache";
import { env } from "@/lib/env";

async function run(request: NextRequest, redirectAfter: boolean) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Not signed in. Connect a provider first." },
      { status: 401 },
    );
  }

  const date = request.nextUrl.searchParams.get("date") ?? undefined;
  const result = await syncDay(userId, date);

  revalidatePath("/");

  if (redirectAfter) {
    const params = new URLSearchParams();
    if (result.errors.length > 0) {
      params.set("error", result.errors.join(" · "));
    } else {
      params.set("connected", "Synced");
    }
    return NextResponse.redirect(`${env().APP_URL}/?${params}`, { status: 303 });
  }

  return NextResponse.json(result);
}

/** Form-driven sync from the dashboard button. */
export async function POST(request: NextRequest) {
  return run(request, true);
}

/** JSON sync, for cron jobs or scripts. */
export async function GET(request: NextRequest) {
  return run(request, false);
}
