import { NextResponse } from "next/server";
import { requireUser, accountMembership } from "@/lib/auth/server";
import { getServiceClient } from "@/lib/supabase";
import { jsonError } from "@/lib/api";
export async function GET() {
  try {
    const { user } = await requireUser();
    const sb = getServiceClient();
    const membership = await accountMembership(sb, user);
    return NextResponse.json(
      {
        email: user.email,
        name: user.user_metadata?.full_name ?? "",
        membership,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return jsonError(e, "Could not load your account.");
  }
}
