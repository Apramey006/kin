import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { getServiceClient, FAMILY_ID } from "@/lib/supabase";
import { seedDemo } from "@/lib/seed";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  try {
    const sb = getServiceClient();
    const result = await seedDemo(sb, FAMILY_ID);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return jsonError(e, "seed failed");
  }
}
