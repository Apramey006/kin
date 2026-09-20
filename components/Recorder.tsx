"use client";

import { useRef, useState, useEffect } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return "";
}

export function Recorder({
  onRecorded,
  maxSeconds = 60,
  label = "Record",
  disabled = false,
  previewBeforeSave = false,
}: {
  onRecorded: (blob: Blob, mimeType: string) => void;
  maxSeconds?: number;
  label?: string;
  disabled?: boolean;
  previewBeforeSave?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [lastRecording, setLastRecording] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!previewBeforeSave || !lastRecording) return;
    const url = URL.createObjectURL(lastRecording); setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [lastRecording, previewBeforeSave]);
  const active = useRef(true);
  const streamRef = useRef<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [remaining, setRemaining] = useState(maxSeconds);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      const recorder = recorderRef.current;
      if (recorder) { recorder.onstop = null; if (recorder.state !== "inactive") recorder.stop(); }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const stop = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const start = async () => {
    if (starting || disabled) return;
    setStarting(true); setError(null);
    try {
    if (!navigator.mediaDevices || typeof MediaRecorder === "undefined") throw new Error("Recording is unavailable. Use a supported browser over HTTPS.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (!active.current) { stream.getTracks().forEach((track) => track.stop()); return; }
    streamRef.current = stream;
    const mime = pickMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, {
        type: rec.mimeType || mime || "audio/webm",
      });
      if (active.current && blob.size) { setLastRecording(blob); if (!previewBeforeSave) onRecorded(blob, blob.type); }
    };
    recorderRef.current = rec;
    rec.start();
    setRecording(true);
    setRemaining(maxSeconds);
    timerRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          stop();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    } catch (failure) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (active.current) setError(failure instanceof Error ? failure.message : "Microphone is unavailable.");
    } finally { if (active.current) setStarting(false); }
  };

  const pct = Math.max(0, Math.min(1, remaining / maxSeconds));
  return (
    <div className="flex flex-wrap items-center gap-4">
      {recording ? (
        <Button
          aria-label="Stop recording"
          onClick={stop}
          size="lg"
          variant="outline"
          className="border-primary/40 text-primary"
        >
          <span className="relative flex h-3 w-3 items-center justify-center" aria-hidden>
            <span className="kin-pulse absolute h-3 w-3 rounded-full bg-red-500/40" />
            <Square className="h-3 w-3 fill-current" />
          </span>
          Stop ({remaining}s)
        </Button>
      ) : (
        <Button onClick={start} size="lg" disabled={disabled || starting}>
          <Mic className="h-5 w-5" /> {starting ? "Opening microphone…" : label}
        </Button>
      )}
      {!recording && previewUrl && <audio controls src={previewUrl} aria-label="Preview your recording" />}
      {!recording && lastRecording && <Button variant="outline" disabled={disabled || starting} onClick={() => onRecorded(lastRecording, lastRecording.type)}>{previewBeforeSave ? "Save memory" : "Send recording again"}</Button>}
      {error && <p role="alert" className="w-full text-sm text-amber-700">{error}</p>}
      {recording && (
        <div className="flex min-w-[8rem] flex-1 items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear"
              style={{ width: `${pct * 100}%` }}
            />
          </div>
          <span className="text-sm tabular-nums text-ink/50">up to {maxSeconds}s</span>
        </div>
      )}
    </div>
  );
}
