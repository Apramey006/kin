"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getAnonClient } from "@/lib/supabase";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ImagePlus, Mic, BookHeart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Recorder } from "@/components/Recorder";
import { PhotoUploader } from "@/components/PhotoUploader";
import { WeaverInbox } from "@/components/WeaverInbox";
import type { GraphNodeRow, MemoryRow, Relative } from "@/lib/types";

interface Chip {
  label: string;
  type: string;
  relation_to_wearer: string | null;
}

export default function FamilyPage() {
  const [relatives, setRelatives] = useState<Relative[]>([]);
  const [personNodes, setPersonNodes] = useState<GraphNodeRow[]>([]);
  const [me, setMe] = useState<Relative | null>(null);
  const [loading, setLoading] = useState(true);
  const [myMemories, setMyMemories] = useState<MemoryRow[]>([]);
  const [storyResult, setStoryResult] = useState<{
    transcript: string;
    entities: Chip[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPersonNodes = useCallback(async () => {
    const sb = getAnonClient();
    if (!sb) return;
    const { data } = await sb
      .from("graph_nodes")
      .select("*")
      .eq("type", "person");
    setPersonNodes((data ?? []) as GraphNodeRow[]);
  }, []);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/family", { cache: "no-store" });
      if (res.status === 401) {
        window.location.replace("/signin?next=/family");
        return;
      }
      if (res.status === 409) {
        window.location.replace("/onboarding");
        return;
      }
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not load your family.");
      const sorted = ((j.relatives ?? []) as Relative[]).sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      setRelatives(sorted);
      setPersonNodes((j.personNodes ?? []) as GraphNodeRow[]);
      setMe(j.me ?? null);
      setLoading(false);
    })().catch((e) => {
      setError(e instanceof Error ? e.message : "Could not load your family.");
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const sb = getAnonClient();
    if (!sb) return;
    const channel = sb
      .channel("family-graph-nodes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "graph_nodes" },
        () => loadPersonNodes()
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [loadPersonNodes]);

  const loadMyMemories = useCallback(async (id: string) => {
    const sb = getAnonClient();
    if (!sb) return;
    const { data } = await sb
      .from("memories")
      .select("id, kind, summary, caption, transcript, created_at")
      .eq("contributor_id", id)
      .order("created_at", { ascending: false });
    setMyMemories((data ?? []) as MemoryRow[]);
  }, []);

  useEffect(() => {
    if (me) loadMyMemories(me.id);
  }, [me, loadMyMemories]);

  const submitStory = async (blob: Blob, mime: string) => {
    if (!me) return;
    setBusy(true);
    setError(null);
    setStoryResult(null);
    try {
      const fd = new FormData();
      fd.append(
        "file",
        new File([blob], `story.${mime.includes("mp4") ? "m4a" : "webm"}`, { type: mime })
      );
      fd.append("contributor_id", me.id);
      const res = await fetch("/api/memories/story", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "story failed");
      setStoryResult({ transcript: json.transcript, entities: json.entities });
      loadMyMemories(me.id);
      loadPersonNodes();
    } catch (e) {
      setError(e instanceof Error ? e.message : "story failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper p-6">
        <p className="text-ink/60" role="status">
          Loading your family…
        </p>
      </main>
    );
  }

  if (!me) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper p-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Finish setting up your family</CardTitle>
          </CardHeader>
          <CardContent className="text-ink/70">
            {error ?? "Your account is not linked to a family member yet."}
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper pb-16">
      <header className="sticky top-0 z-10 border-b border-ink/[0.07] bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3.5">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white"
            style={{ background: me.color }}
            aria-hidden
          >
            {me.name.trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold leading-tight">
              Hi, {me.name}
            </h1>
            <p className="truncate text-sm text-ink/50">{me.relation_to_wearer}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href="/settings">Settings</Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await getAnonClient()?.auth.signOut();
                window.location.assign("/signin");
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-5 px-4 py-6">
        <WeaverInbox me={me} relatives={relatives} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImagePlus className="h-[18px] w-[18px] text-primary" />
              Add a photo
            </CardTitle>
            <CardDescription>
              Kin learns faces only from photos you label.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PhotoUploader
              contributorId={me.id}
              personNodes={personNodes}
              onDone={() => {
                loadMyMemories(me.id);
                loadPersonNodes();
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mic className="h-[18px] w-[18px] text-primary" />
              Record a story
            </CardTitle>
            <CardDescription>
              Say it the way you would tell it. Up to a minute.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Recorder onRecorded={submitStory} label="Record a memory" disabled={busy} />
            {busy && (
              <p className="flex items-center gap-2 text-ink/55">
                <span className="kin-pulse h-2 w-2 rounded-full bg-primary" />
                Kin is listening to your story…
              </p>
            )}
            {storyResult && (
              <div className="animate-fade-up rounded-2xl border border-ink/[0.07] bg-paper-deep p-4">
                <p className="mb-3 leading-relaxed text-ink/80">
                  {storyResult.transcript}
                </p>
                <div className="flex flex-wrap gap-2">
                  {storyResult.entities.map((c, i) => (
                    <span
                      key={i}
                      className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
                    >
                      {c.label}
                      {c.relation_to_wearer && c.relation_to_wearer !== "self"
                        ? ` · ${c.relation_to_wearer}`
                        : ""}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm font-medium text-amber-700">
                {error}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookHeart className="h-[18px] w-[18px] text-primary" />
              My memories
            </CardTitle>
            <CardDescription>
              {myMemories.length
                ? `${myMemories.length} shared with the family`
                : "Nothing shared yet"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!myMemories.length ? (
              <p className="rounded-2xl border border-dashed border-ink/15 px-5 py-8 text-center text-ink/45">
                Nothing yet. Your stories will live here.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {myMemories.map((m) => (
                  <li
                    key={m.id}
                    className="rounded-2xl border border-ink/[0.07] bg-paper-deep px-4 py-3"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/40">
                      {m.kind}
                    </span>
                    <p className="mt-0.5 leading-relaxed text-ink/85">{m.summary}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
