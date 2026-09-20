import { NextResponse } from "next/server";
import { requireFamily } from "@/lib/auth/server";
import { jsonError } from "@/lib/api";
import { synthesizeSpeech } from "@/lib/providers/elevenlabs";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireFamily();
    const { text } = (await req.json()) as { text: string };
    if (typeof text !== "string" || !text.trim() || text.length > 1000) return NextResponse.json({ error: "text required" }, { status: 400 });
    const mp3 = await synthesizeSpeech(text);
    return new Response(new Uint8Array(mp3), {
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (e) {
    return jsonError(e, "tts failed");
  }
}
