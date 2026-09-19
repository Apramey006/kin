import { NextResponse } from "next/server";
import { getServiceClient, FAMILY_ID } from "@/lib/supabase";
import { resetFamily } from "@/lib/seed";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST() {
  try {
    const sb = getServiceClient();
    await resetFamily(sb, FAMILY_ID);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "reset failed" },
      { status: 500 }
    );
  }
}
