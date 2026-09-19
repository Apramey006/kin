import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
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
    return jsonError(e, "reset failed");
  }
}
