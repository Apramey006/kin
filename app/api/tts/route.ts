import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { authenticateFamily } from "@/lib/ingestion/auth";
import { ingestionError } from "@/lib/ingestion/http";
import { z } from "zod";
import { synthesizeSpeech } from "@/lib/providers/elevenlabs";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const sb = getServiceClient();
    const { familyId } = await authenticateFamily(req, sb);
    const { eventId } = z.object({ eventId: z.string().uuid() }).strict().parse(await req.json());
    const result = await sb.from("recall_events").select("cue_text,status,gate")
      .eq("id", eventId).eq("family_id", familyId).single();
    if (result.error || result.data?.status !== "speak" || result.data?.gate?.decision !== "speak" || !result.data?.cue_text) {
      return NextResponse.json({ error: "A verified spoken cue is required" }, { status: 404 });
    }
    const mp3 = await synthesizeSpeech(result.data.cue_text);
    return new Response(new Uint8Array(mp3), {
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (e) {
    return ingestionError(e);
  }
}
