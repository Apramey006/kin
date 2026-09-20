import { withTimeout } from "../util";
import { CONFIG } from "../config";

export const TTS_TIMEOUT_MS = CONFIG.timeouts.ttsMs;

/** Text to speech via ElevenLabs. Returns an MP3 buffer. */
export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) {
    throw new Error("ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID not configured");
  }
  const res = await withTimeout(
    fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: { stability: 0.6, similarity_boost: 0.7 },
        }),
      }
    ),
    TTS_TIMEOUT_MS,
    "elevenlabs"
  );
  if (!res.ok) {
    throw new Error(`ElevenLabs request failed (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}
