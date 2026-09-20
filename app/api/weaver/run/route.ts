import { NextResponse } from "next/server";
import { ingestionError, idSchema } from "@/lib/ingestion/http";
import { authenticateIngestion } from "@/lib/ingestion/auth";
import { getServiceClient } from "@/lib/supabase";
import { runWeaver } from "@/lib/weaver";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const sb = getServiceClient();
    const identity = await authenticateIngestion(req, sb);
    const topic = new URL(req.url).searchParams.get("topic");
    const topicId = topic === null ? undefined : idSchema.parse(topic);
    return NextResponse.json(await runWeaver(sb, identity.familyId, topicId));
  } catch (e) {
    return ingestionError(e);
  }
}
