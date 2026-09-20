import { NextResponse } from "next/server";
import { requireFamily } from "@/lib/auth/server";
import { jsonError } from "@/lib/api";
import { validAudioSegments } from "@/lib/living-stories";

/** Refresh private media when a chapter opens; never expose storage credentials. */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { sb, familyId } = await requireFamily();
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid memory" }, { status: 400 });
    // '*' tolerates deployments preceding migration 005. Return only the fields below.
    const result = await sb.from("memories").select("*")
      .eq("id", id).eq("family_id", familyId).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return NextResponse.json({ error: "This memory is no longer available." }, { status: 404 });
    const memory = result.data;
    let mediaUrl: string | null = null;
    if (memory.media_path) {
      const signed = await sb.storage.from("media").createSignedUrl(memory.media_path, 3600);
      if (signed.error) throw signed.error;
      mediaUrl = signed.data.signedUrl;
    }
    return NextResponse.json({
      id: memory.id, transcript: memory.transcript, mediaUrl,
      segments: validAudioSegments(memory.audio_segments, memory.transcript ?? ""),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error, "This recording could not be loaded. Please try again.");
  }
}
