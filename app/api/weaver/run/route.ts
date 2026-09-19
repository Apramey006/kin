import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { getServiceClient, FAMILY_ID } from "@/lib/supabase";
import { runWeaver } from "@/lib/weaver";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST() {
  try {
    const sb = getServiceClient();
    const { question, gap } = await runWeaver(sb, FAMILY_ID);
    if (!question) {
      return NextResponse.json({ question: null, gap, message: "no gaps found" });
    }
    return NextResponse.json({ question, gap });
  } catch (e) {
    return jsonError(e, "weaver failed");
  }
}
