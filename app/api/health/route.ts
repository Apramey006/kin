import { NextResponse } from "next/server";
import { supabaseConfigured, getServiceClient } from "@/lib/supabase";
import { getAIProvider, aiConfigured } from "@/lib/providers/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const keys = {
    supabase: supabaseConfigured(),
    openai: Boolean(process.env.OPENAI_API_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
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
  let ai: { provider: string | null; configured: boolean; error?: string };
  try {
    ai = { provider: getAIProvider(), configured: aiConfigured() };
  } catch (error) {
    ai = { provider: null, configured: false, error: error instanceof Error ? error.message : "Invalid AI configuration" };
  }
  return NextResponse.json({ keys, ai, supabaseReachable });
}
