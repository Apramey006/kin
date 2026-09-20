import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server";
import { getServiceClient } from "@/lib/supabase";
import { jsonError } from "@/lib/api";
export async function GET() {
  try {
    const { user } = await requireUser();
    const sb = getServiceClient();
    const membership = await sb
      .from("family_members")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (membership.error)
      return NextResponse.json(
        {
          error: "Family accounts are being set up. Please try again shortly.",
          setupRequired: true,
        },
        { status: 503 },
      );
    return NextResponse.json(
      {
        email: user.email,
        name: user.user_metadata?.full_name ?? "",
        membership: membership.data,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return jsonError(e, "Could not load your account.");
  }
}
