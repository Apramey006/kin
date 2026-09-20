import { NextResponse } from "next/server";
import { ingestionError } from "@/lib/ingestion/http";
import { authenticateAdmin } from "@/lib/ingestion/auth";
import { getServiceClient } from "@/lib/supabase";
import { seedDemo } from "@/lib/seed";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const sb = getServiceClient();
    const identity = await authenticateAdmin(req, sb);
    const result = await seedDemo(sb, identity.familyId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return ingestionError(e);
  }
}
