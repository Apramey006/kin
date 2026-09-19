import { NextResponse } from "next/server";
import { synthesizeSpeech } from "@/lib/providers/elevenlabs";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { text } = (await req.json()) as { text: string };
    if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
    const mp3 = await synthesizeSpeech(text);
    return new Response(new Uint8Array(mp3), {
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "tts failed" },
      { status: 500 }
    );
  }
}
