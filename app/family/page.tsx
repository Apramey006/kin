"use client";

import { useEffect, useState, useCallback } from "react";
import { getAnonClient, FAMILY_ID } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [myMemories, setMyMemories] = useState<MemoryRow[]>([]);
  const [storyResult, setStoryResult] = useState<{
    transcript: string;
    entities: Chip[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  const loadPersonNodes = useCallback(async () => {
    const sb = getAnonClient();
    if (!sb) return;
    const { data } = await sb
      .from("graph_nodes")
      .select("*")
      .eq("family_id", FAMILY_ID)
      .eq("type", "person");
    setPersonNodes((data ?? []) as GraphNodeRow[]);
  }, []);

  useEffect(() => {
    const sb = getAnonClient();
    if (!sb) {
      setNotConfigured(true);
      return;
    }
    (async () => {
      const { data: rels } = await sb
        .from("relatives")
        .select("*")
        .eq("family_id", FAMILY_ID);
      const sorted = ((rels ?? []) as Relative[]).sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      setRelatives(sorted);
      try {
        const saved = window.localStorage.getItem("kin_relative_id");
        const found = (rels ?? []).find((r: Relative) => r.id === saved);
        if (found) setMe(found);
      } catch {
        // localStorage unavailable; picker stays up
      }
    })();
    loadPersonNodes();
    const channel = sb
      .channel("family-graph-nodes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "graph_nodes", filter: `family_id=eq.${FAMILY_ID}` },
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
      .eq("family_id", FAMILY_ID)
      .eq("contributor_id", id)
      .order("created_at", { ascending: false });
    setMyMemories((data ?? []) as MemoryRow[]);
  }, []);

  useEffect(() => {
    if (me) loadMyMemories(me.id);
  }, [me, loadMyMemories]);

  const pickMe = (r: Relative) => {
    setMe(r);
    try {
      window.localStorage.setItem("kin_relative_id", r.id);
    } catch {
      // ignore
    }
  };

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

  if (notConfigured) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-paper p-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Kin needs its keys</CardTitle>
          </CardHeader>
          <CardContent>
            Supabase is not configured. Copy .env.example to .env.local and fill
            in the keys, then run the seed.
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!me) {
    return (
      <main className="min-h-screen bg-paper flex flex-col items-center justify-center p-6">
        <h1 className="text-3xl font-semibold mb-8">Who are you?</h1>
        <div className="grid gap-4 w-full max-w-md">
          {relatives.map((r) => (
            <button
              key={r.id}
              onClick={() => pickMe(r)}
              className="rounded-2xl border-2 bg-white px-6 py-5 text-left text-xl font-medium hover:shadow-md transition"
              style={{ borderColor: r.color }}
            >
              {r.name}
              <span className="block text-base font-normal text-ink/60">
                {r.relation_to_wearer}
              </span>
            </button>
          ))}
          {!relatives.length && (
            <p className="text-ink/60">
              No relatives yet. Run the seed (Stage → Seed demo) first.
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper">
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">
              Hi, <span style={{ color: me.color }}>{me.name}</span>
            </h1>
            <p className="text-ink/60">{me.relation_to_wearer}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setMe(null)}>
            Not {me.name}?
          </Button>
        </header>

        <WeaverInbox me={me} relatives={relatives} />

        <Card>
          <CardHeader>
            <CardTitle>Add a photo</CardTitle>
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
            <CardTitle>Record a story</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Recorder onRecorded={submitStory} label="Record a memory" disabled={busy} />
            {busy && (
              <p className="text-ink/60">Kin is listening to your story...</p>
            )}
            {storyResult && (
              <div className="rounded-xl bg-ink/5 p-4">
                <p className="mb-2">{storyResult.transcript}</p>
                <div className="flex flex-wrap gap-2">
                  {storyResult.entities.map((c, i) => (
                    <span
                      key={i}
                      className="rounded-full bg-primary/10 text-primary px-3 py-1 text-sm"
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
            {error && <p className="text-sm text-amber-700">{error}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>My memories</CardTitle>
          </CardHeader>
          <CardContent>
            {!myMemories.length && (
              <p className="text-ink/50">Nothing yet. Your stories will live here.</p>
            )}
            <ul className="space-y-3">
              {myMemories.map((m) => (
                <li key={m.id} className="rounded-xl bg-ink/5 p-3">
                  <span className="text-xs uppercase tracking-wide text-ink/40">
                    {m.kind}
                  </span>
                  <p>{m.summary}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
