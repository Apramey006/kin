"use client";
import { useCallback, useEffect, useState } from "react";
import { getAnonClient } from "./supabase";
import type {
  Relative,
  Wearer,
  MemoryRow,
  GraphNodeRow,
  GraphEdgeRow,
  ProvenanceRow,
  RecallEventRow,
  WeaverQuestionRow,
} from "./types";
export interface FamilyData {
  familyId: string;
  relativeId: string | null;
  role?: "contributor" | "loved_one";
  lovedOneConnected?: boolean;
  isOwner: boolean;
  email: string;
  wearer: Wearer;
  relatives: Relative[];
  memories: (MemoryRow & { mediaUrl: string | null })[];
  nodes: GraphNodeRow[];
  edges: GraphEdgeRow[];
  provenance: ProvenanceRow[];
  events: RecallEventRow[];
  questions: WeaverQuestionRow[];
  faces: {
    person_node_id: string;
    contributor_id: string;
    memory_id: string;
  }[];
}
export function useFamilyData() {
  const [data, setData] = useState<FamilyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/family", { cache: "no-store" });
      if (res.status === 401) {
        window.location.replace("/signin");
        return;
      }
      if (res.status === 409) {
        window.location.replace("/onboarding");
        return;
      }
      const body = await res.json();
      if (!res.ok)
        throw new Error(body.error ?? "Your memories couldn't be loaded.");
      setData(body);
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not connect. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 15000);
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  useEffect(() => {
    if (!data?.familyId) return;
    const sb = getAnonClient();
    if (!sb) return;
    let timer: ReturnType<typeof setTimeout>;
    const channel = sb
      .channel(`family-${data.familyId}`)
      .on("postgres_changes", { event: "*", schema: "public" }, () => {
        clearTimeout(timer);
        timer = setTimeout(refresh, 250);
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      clearTimeout(timer);
      sb.removeChannel(channel);
    };
  }, [data?.familyId, refresh]);
  return { data, error, loading, live, refresh };
}
export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
export const relativeTime = (value: string) => {
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  return minutes < 1
    ? "Just now"
    : minutes < 60
      ? `${minutes} min ago`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)} hr ago`
        : new Date(value).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          });
};
