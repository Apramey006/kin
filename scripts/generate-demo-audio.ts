import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { DEMO_FAMILY_ID, DEMO_CONTRIBUTOR_IDS } from "../lib/demo";
import { isDemoNarrationCandidate, narrationSegments } from "../lib/demo-audio";
import type { MemoryRow } from "../lib/types";

// Stock voices for fictional characters, not clones of family members.
const voices = {
  [DEMO_CONTRIBUTOR_IDS.maya]: { name: "Maya", id: "cgSgspJ2msm6clMCkdW9" }, // Jessica
  [DEMO_CONTRIBUTOR_IDS.david]: { name: "David", id: "JBFqnCBsd6RMkjVDRZzb" }, // George
  [DEMO_CONTRIBUTOR_IDS.elena]: { name: "Elena", id: "pFZP5JQG7iQjIQuC4Bku" }, // Lily
};
const model = "eleven_multilingual_v2";

async function main() {
  loadEnvConfig(process.cwd());
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration required");
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await sb.from("memories").select("*").eq("family_id", DEMO_FAMILY_ID).eq("kind", "story");
  if (result.error) throw new Error("Could not load demo memories");
  const memories = (result.data as MemoryRow[]).filter(isDemoNarrationCandidate);
  console.log(`${memories.length} demo stories need narration (${memories.reduce((sum, m) => sum + m.transcript!.length, 0)} characters).`);
  if (!process.argv.includes("--apply")) { console.log("Preview only. Add --apply to generate and attach audio."); return; }
  if (!memories.length) return;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is required");
  const cache = "demo/fixtures/private/narration";
  await mkdir(cache, { recursive: true });
  for (const memory of memories) {
    const voice = voices[memory.contributor_id as keyof typeof voices];
    if (!voice) throw new Error("Unknown demo contributor");
    const hash = createHash("sha256").update(JSON.stringify([memory.transcript, voice.id, model])).digest("hex");
    const cached = `${cache}/${memory.id}-${hash}.json`;
    let generated;
    try { generated = JSON.parse(await readFile(cached, "utf8")); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.id}/with-timestamps?output_format=mp3_44100_128`, {
        method: "POST", headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ text: memory.transcript, model_id: model,
          voice_settings: { stability: 0.55, similarity_boost: 0.7 }, seed: 42 }),
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw new Error(`ElevenLabs generation failed (${response.status}); cached clips will be reused on retry`);
      generated = await response.json();
      await writeFile(cached, JSON.stringify(generated), { mode: 0o600 });
    }
    if (typeof generated.audio_base64 !== "string") throw new Error("Missing generated audio");
    const audio = Buffer.from(generated.audio_base64, "base64");
    if (audio.length < 1000) throw new Error("Empty generated recording");
    const segments = generated.alignment ? narrationSegments(memory.transcript!, generated.alignment) : [];
    const path = `${DEMO_FAMILY_ID}/${memory.contributor_id}/${memory.id}/demo-narration/${hash}.mp3`;
    const uploaded = await sb.storage.from("media").upload(path, audio, { contentType: "audio/mpeg", upsert: true });
    if (uploaded.error) throw new Error("Could not upload demo narration");
    // Conditional update preserves a recording added or text edited during generation.
    let update = sb.from("memories").update({ media_path: path,
      source: { ...memory.source, type: "synthetic", demo: true, generated_audio: true,
        origin: "Fictional HackMIT demo narration", audio_provider: "elevenlabs", audio_model: model,
        audio_voice_id: voice.id, audio_segments: segments },
    }).eq("id", memory.id).eq("family_id", DEMO_FAMILY_ID).eq("contributor_id", memory.contributor_id)
      .eq("transcript", memory.transcript!).is("media_path", null);
    update = memory.source ? update.eq("source", JSON.stringify(memory.source)) : update.is("source", null);
    const attached = await update.select("id");
    if (attached.error) throw new Error("Could not attach demo narration");
    console.log(attached.data?.length ? `${voice.name}: attached narration (${segments.length} timed passages).` : `${voice.name}: skipped changed memory.`);
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Demo audio generation failed"); process.exitCode = 1; });
