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
      setCameraError("Camera is not ready yet.");
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
    <main className="fixed inset-0 bg-paper text-ink flex flex-col text-[22px]">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="font-semibold text-primary">Kin</span>
        <span className="text-ink/70">{wearerName}</span>
      </header>

      <div className="relative flex-1 overflow-hidden bg-ink/5">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />
        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-ink/70">
            {cameraError}
          </div>
        )}
        {phase === "cue" && cueText && (
          <div className="absolute inset-x-6 bottom-6 rounded-2xl bg-paper/95 px-6 py-5 text-center text-[26px] font-medium leading-snug shadow-lg">
            {cueText}
          </div>
        )}
      </div>

      <div className="px-6 pb-6 pt-4">
        <button
          onClick={onTap}
          disabled={phase !== "idle"}
          className={`w-full min-h-[240px] rounded-3xl bg-primary text-white text-[30px] font-semibold ${
            phase === "thinking" ? "kin-pulse" : ""
          } ${phase === "cue" ? "opacity-60" : ""}`}
        >
          {phase === "thinking" ? "Thinking…" : "Who is this?"}
        </button>
      </div>
    </main>
  );
}
