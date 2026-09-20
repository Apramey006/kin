import { NextResponse } from "next/server";
import { supabaseConfigured, getServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const keys = {
    supabase: supabaseConfigured(),
    openai: Boolean(process.env.OPENAI_API_KEY),
    deepgram: Boolean(process.env.DEEPGRAM_API_KEY),
    elevenlabs: Boolean(
      process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID
    ),
  };
  let supabaseReachable = false;
  if (keys.supabase) {
    try {
      const { error } = await getServiceClient()
        .from("wearer")
        .select("family_id")
        .limit(1);
      supabaseReachable = !error;
    } catch {
      supabaseReachable = false;
    }
  }
  return NextResponse.json({ keys, supabaseReachable });
}
