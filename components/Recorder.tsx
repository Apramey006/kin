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
}: {
  onRecorded: (blob: Blob, mimeType: string) => void;
  maxSeconds?: number;
  label?: string;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [remaining, setRemaining] = useState(maxSeconds);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const stop = () => {
    recorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      onRecorded(blob, blob.type);
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
  };

  const pct = Math.max(0, Math.min(1, remaining / maxSeconds));
  return (
    <div className="flex flex-wrap items-center gap-4">
      {recording ? (
        <Button
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
        <Button onClick={start} size="lg" disabled={disabled}>
          <Mic className="h-5 w-5" /> {label}
        </Button>
      )}
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
