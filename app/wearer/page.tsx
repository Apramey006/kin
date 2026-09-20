"use client";

import { useEffect, useRef, useState } from "react";
import { getAnonClient, FAMILY_ID } from "@/lib/supabase";
import { loadFaceModels, detectFaces } from "@/lib/faces";
import { CONFIG } from "@/lib/config";

// Tiny silent MP3 used to unlock audio playback inside the tap handler (iOS).
const SILENT_MP3 =
  "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAADhAC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7////////////////////////////////////////////////////////////////AAAAAExhdmM1OC4xMwAAAAAAAAAAAAAAACQCQAAAAAAAADhA1Z7mGQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//sQZAAP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=";

type Phase = "idle" | "thinking" | "cue";

export default function WearerPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [cueText, setCueText] = useState<string | null>(null);
  const [wearerName, setWearerName] = useState<string>("");
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    // Pre-create the audio element; iOS requires play() inside the tap handler.
    audioRef.current = new Audio(SILENT_MP3);
    loadFaceModels().catch(() => {});
    getAnonClient()
      ?.from("wearer")
      .select("name")
      .eq("family_id", FAMILY_ID)
      .single()
      .then(({ data }) => setWearerName(data?.name ?? ""));
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setCameraError("Camera is not available on this device."));
    return () => {
      if (cueTimerRef.current) clearTimeout(cueTimerRef.current);
    };
  }, []);

  const captureFrame = (): { blob: Promise<Blob>; canvas: HTMLCanvasElement } | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const scale = Math.min(1, CONFIG.snapshotMaxPx / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("capture failed"))),
        "image/jpeg",
        0.85
      )
    );
    return { blob, canvas };
  };

  const speakFallback = (text: string) => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95;
      window.speechSynthesis.speak(u);
    } catch {
      // no audio available; cue text still shows
    }
  };

  const onTap = async () => {
    if (phase !== "idle") return;
    if (cueTimerRef.current) {
      clearTimeout(cueTimerRef.current);
      cueTimerRef.current = null;
    }
    // 1. Unlock audio inside the tap handler, before any await.
    const audio = audioRef.current;
    if (audio) audio.onerror = null;
    audio?.play().catch(() => {});

    const frame = captureFrame();
    if (!frame) {
      setCameraError("One moment, the camera is warming up.");
      return;
    }
    setPhase("thinking");
    setCueText(null);
    try {
      const faces = await detectFaces(frame.canvas);
      const blob = await frame.blob;
      const fd = new FormData();
      fd.append("snapshot", new File([blob], "snapshot.jpg", { type: "image/jpeg" }));
      fd.append("faceDescriptors", JSON.stringify(faces.map((f) => f.descriptor)));
      const res = await fetch("/api/recall", { method: "POST", body: fd });
      const json = await res.json();

      if (res.ok && json.decision === "speak") {
        setCueText(json.cueText);
        setPhase("cue");
        if (json.audio && audio) {
          let fellBack = false;
          const fallbackOnce = () => {
            if (fellBack) return;
            fellBack = true;
            speakFallback(json.cueText);
          };
          audio.onerror = fallbackOnce;
          audio.src = `data:audio/mp3;base64,${json.audio}`;
          audio.play().catch(fallbackOnce);
        } else {
          speakFallback(json.cueText);
        }
        cueTimerRef.current = setTimeout(() => {
          setPhase("idle");
          setCueText(null);
        }, CONFIG.wearerCueDisplayMs);
      } else {
        // SILENT: play nothing, show nothing, return to idle quietly.
        setPhase("idle");
      }
    } catch {
      setPhase("idle");
    }
  };

  return (
    <main className="fixed inset-0 flex flex-col bg-stage text-white text-[22px]">
      <header className="flex items-center justify-between px-6 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <span className="text-lg font-semibold tracking-[0.18em] text-white/70">
          KIN
        </span>
        {wearerName && (
          <span className="text-lg text-white/50">{wearerName}</span>
        )}
      </header>

      <div className="relative mx-4 flex-1 overflow-hidden rounded-3xl bg-black/40 ring-1 ring-white/10">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onPlaying={() => setCameraError(null)}
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/* Gentle viewfinder framing, decorative only. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-3xl shadow-[inset_0_0_120px_rgba(0,0,0,0.45)]"
        />

        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-[24px] leading-snug text-white/70">
            {cameraError}
          </div>
        )}

        {phase === "thinking" && (
          <div className="absolute inset-x-0 bottom-6 flex justify-center">
            <span className="kin-pulse rounded-full bg-black/55 px-5 py-2 text-[20px] font-medium text-white/90 backdrop-blur-sm">
              Looking…
            </span>
          </div>
        )}

        <div aria-live="polite" className="sr-only">
          {phase === "cue" && cueText ? cueText : ""}
        </div>

        {phase === "cue" && cueText && (
          <div className="animate-fade-up absolute inset-x-4 bottom-4 rounded-3xl bg-paper/95 px-7 py-6 text-center text-[28px] font-medium leading-snug text-ink shadow-cue backdrop-blur-sm">
            {cueText}
          </div>
        )}
      </div>

      <div className="px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        <button
          onClick={onTap}
          disabled={phase !== "idle"}
          className={`w-full min-h-[220px] rounded-[2rem] bg-primary text-[32px] font-semibold text-white shadow-[0_18px_40px_-18px_rgba(47,93,80,0.9)] ring-1 ring-white/10 transition-transform duration-150 active:scale-[0.985] disabled:active:scale-100 ${
            phase === "thinking" ? "kin-pulse" : ""
          } ${phase === "cue" ? "opacity-60" : ""}`}
        >
          {phase === "thinking" ? "Thinking…" : "Who is this?"}
        </button>
      </div>
    </main>
  );
}
