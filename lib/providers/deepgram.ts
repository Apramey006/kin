import { validAudioSegments, type AudioSegment } from "../living-stories";

const LISTEN_URL =
  "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&utterances=true";

/** Transcribe a prerecorded audio buffer (webm, mp4, m4a, wav...). */
export async function transcribeAudio(
  audio: Buffer,
  mimeType: string
): Promise<string> {
  return (await transcribeTimedAudio(audio, mimeType)).transcript;
}

export async function transcribeTimedAudio(
  audio: Buffer,
  mimeType: string,
  familyNames: string[] = [],
): Promise<{ transcript: string; segments: AudioSegment[] }> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY not configured");
  if (!audio.length) throw new Error("Empty audio");
  const url = new URL(LISTEN_URL);
  // Give speech recognition family context before extraction creates people.
  // Hints do not rewrite the returned transcript or merge similar names.
  const names = [...new Set(familyNames.map(name => name.trim()).filter(Boolean))];
  let remaining = 400; // Conservative UTF-8 byte budget, below the 500-token limit.
  for (const name of names.slice(0, 50)) {
    const bytes = Buffer.byteLength(name, "utf8");
    if (bytes > remaining) continue;
    url.searchParams.append("keyterm", name);
    remaining -= bytes;
  }
  if (url.searchParams.has("keyterm")) url.searchParams.set("model", "nova-3");
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": mimeType || "application/octet-stream",
    },
    body: new Uint8Array(audio),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`Deepgram error ${res.status}`);
  }
  const json = await res.json();
  const transcript: unknown =
    json?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
  if (typeof transcript !== "string") throw new Error("Invalid Deepgram response");
  const utterances = json?.results?.utterances;
  const segments = validAudioSegments(Array.isArray(utterances) ? utterances.map((u) => ({
    start: u.start, end: u.end, text: u.transcript,
  })) : [], transcript);
  return { transcript: transcript.trim(), segments };
}
