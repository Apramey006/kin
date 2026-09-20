import { NextResponse } from "next/server";
import { ingestionError } from "@/lib/ingestion/http";
import { authenticateIngestion } from "@/lib/ingestion/auth";
import { getServiceClient } from "@/lib/supabase";
import { runWeaver } from "@/lib/weaver";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const sb = getServiceClient();
    const identity = await authenticateIngestion(req, sb);
    return NextResponse.json(await runWeaver(sb, identity.familyId));
  } catch (e) {
    return ingestionError(e);
  }
}
