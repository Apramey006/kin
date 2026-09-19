const LISTEN_URL =
  "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true";

/** Transcribe a prerecorded audio buffer (webm, mp4, m4a, wav...). */
export async function transcribeAudio(
  audio: Buffer,
  mimeType: string
): Promise<string> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY not configured");
  if (!audio.length) throw new Error("Empty audio");
  const res = await fetch(LISTEN_URL, {
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
  return transcript.trim();
}
