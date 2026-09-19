import { NextResponse } from "next/server";
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
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "seed failed" },
      { status: 500 }
    );
  }
}
