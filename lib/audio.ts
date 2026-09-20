"use client";

// Valid 50 ms PCM silence used to unlock audio inside a user gesture.
export const SILENT_AUDIO = "data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

const generations = new WeakMap<HTMLAudioElement, number>();

export function stopCue(audio: HTMLAudioElement | null) {
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  if (!audio) return;
  generations.set(audio, (generations.get(audio) ?? 0) + 1);
  audio.onerror = null;
  audio.pause();
}

export function unlockAudio(audio: HTMLAudioElement | null) {
  stopCue(audio);
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  if (!audio) return;
  audio.onerror = null;
  audio.src = SILENT_AUDIO;
  audio.play().catch(() => {});
}

export function playCue(audio: HTMLAudioElement | null, cue: { cueText: string; audio?: string | null }) {
  const generation = audio ? (generations.get(audio) ?? 0) + 1 : 0;
  if (audio) generations.set(audio, generation);
  let fallbackUsed = false;
  const fallback = () => {
    if (fallbackUsed || (audio && generations.get(audio) !== generation)) return;
    fallbackUsed = true;
    if (typeof speechSynthesis !== "undefined") {
      const speech = new SpeechSynthesisUtterance(cue.cueText);
      speech.rate = 0.95;
      speechSynthesis.speak(speech);
    }
  };
  if (!audio || !cue.audio) return fallback();
  audio.onerror = fallback;
  audio.src = `data:audio/mp3;base64,${cue.audio}`;
  audio.play().catch(fallback);
}
