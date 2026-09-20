import { NextResponse } from "next/server";
import { ingestionError } from "@/lib/ingestion/http";
import { authenticateAdmin } from "@/lib/ingestion/auth";
import { getServiceClient } from "@/lib/supabase";
import { resetFamily } from "@/lib/seed";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const sb = getServiceClient();
    const identity = await authenticateAdmin(req, sb);
    await resetFamily(sb, identity.familyId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return ingestionError(e);
  }
}
