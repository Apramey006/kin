/**
 * Actual route handlers + Supabase client + PostgREST + pgvector. External AI,
 * transcription, speech, and media storage are deterministic test doubles.
 * Run only against the disposable database started by scripts/test-db.sh.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const state = vi.hoisted(() => ({ client: null as SupabaseClient | null, removedFiles: [] as string[], failStorageDelete: false }));
vi.mock("../lib/supabase", () => ({ getServiceClient: () => state.client!, FAMILY_ID: "kin-integration" }));
vi.mock("../lib/auth/server", () => ({
  requireFamily: async () => ({ sb: state.client!, familyId: "kin-integration", relativeId: "test-contributor", isOwner: true }),
  requireContributor: () => {},
  AccessError: class extends Error { constructor(message: string, public status: number) { super(message); } },
}));
vi.mock("../lib/providers/deepgram", () => ({ transcribeAudio: async (bytes: Buffer) => bytes.toString() }));
vi.mock("../lib/providers/elevenlabs", () => ({ synthesizeSpeech: async () => Buffer.from("test-audio") }));
vi.mock("../lib/providers/ai", () => ({
  embedText: async () => Array.from({ length: 1536 }, (_, i) => i === 0 ? 1 : 0),
  captionImage: async () => ({ caption: "A person in a yellow apron", objects: ["apron"], setting: "kitchen" }),
  chatJSON: async (opts: { name: string; user: string }) => {
    if (opts.name === "weaver_question") return { question: "Maya remembers Sunday lemon cake. Do you remember where the recipe came from?" };
    if (opts.name !== "memory_extraction") throw new Error(`Unexpected model call: ${opts.name}`);
    const ref = (label: string) => {
      const line = opts.user.split("\n").find((s) => s.includes(`| ${label} |`));
      if (!line) throw new Error(`Missing existing node ${label}`);
      return `existing:${line.split(" | ")[0]}`;
    };
    const node = (label: string, type: string) => ({ ref: ref(label), label, type, relation_to_wearer: null });
    const text = opts.user.split("\n\nText:\n")[1];
    if (text.includes("Italy")) return {
      summary: text,
      nodes: [node("Sunday lemon cake baking", "tradition"), { ref: "new:italy", label: "Italy", type: "place", relation_to_wearer: null }],
      edges: [{ from: ref("Sunday lemon cake baking"), rel: "origin", to: "new:italy" }],
    };
    return { summary: text, nodes: [node("Nora", "person"), node("Rosa", "person"), node("Sunday lemon cake baking", "tradition")],
      edges: ["Nora", "Rosa"].map((label) => ({ from: ref(label), rel: "participates_in", to: ref("Sunday lemon cake baking") })) };
  },
}));

import { seedDemo } from "../lib/seed";
import { POST as photo } from "../app/api/memories/photo/route";
import { POST as story } from "../app/api/memories/story/route";
import { POST as recall, GET as replayTarget } from "../app/api/recall/route";
import { POST as weaver } from "../app/api/weaver/run/route";
import { POST as answer } from "../app/api/weaver/answer/route";
import { DELETE as removeMemory } from "../app/api/memories/[id]/route";
import { applyExtraction } from "../lib/extract";

const enabled = process.env.KIN_TEST_DATABASE === "1";
describe.skipIf(!enabled)("demo loop with real database and mocked providers", () => {
  beforeAll(() => {
    state.client = createClient("http://127.0.0.1:15433", "local-test", {
      auth: { persistSession: false },
      global: { fetch: async (input, init) => {
        const url = String(input);
        if (url.includes("/storage/v1/")) {
          if (init?.method === "DELETE") {
            if (state.failStorageDelete) return new Response(JSON.stringify({ message: "Storage temporarily unavailable" }), { status: 503 });
            state.removedFiles.push(...JSON.parse(String(init.body)).prefixes);
          }
          return new Response(JSON.stringify(url.includes("/list/") ? [] : { Key: "media/test" }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        const headers = new Headers(init?.headers);
        headers.delete("authorization"); headers.delete("apikey");
        return fetch(url.replace("/rest/v1", ""), { ...init, headers });
      } },
    });
  });

  const json = async (response: Response) => {
    const body = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(200);
    return body;
  };
  const formRequest = (values: Record<string, string>, content?: string) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(values)) form.append(key, value);
    if (content !== undefined) form.append("file", new File([content], "recording.webm", { type: "audio/webm" }));
    return new Request("http://localhost/api", { method: "POST", body: form });
  };

  it("resolves omitted existing endpoints and bare UUIDs without accepting another family's nodes", async () => {
    const sb = state.client!;
    const familyId = "kin-edge-resolution";
    const seeded = await seedDemo(sb, familyId);
    const memory = await sb.from("memories").select("id").eq("family_id", familyId).eq("contributor_id", seeded.relatives.maya).single();
    if (!memory.data) throw new Error("Missing fixture memory");
    const foreign = await sb.from("graph_nodes").insert({ family_id: "another-family", label: "Foreign place", type: "place" }).select("id").single();
    if (!foreign.data) throw new Error("Missing foreign node");
    const cake = seeded.nodes["Sunday lemon cake baking"];
    const applied = await applyExtraction(sb, { familyId, memoryId: memory.data.id, contributorId: seeded.relatives.maya, wearerName: "Rosa",
      extraction: { summary: "The recipe came from Italy.", nodes: [{ ref: "new:italy", label: "Italy", type: "place", relation_to_wearer: null }],
        edges: [{ from: cake, rel: "origin", to: "new:italy" },
          { from: `existing:${seeded.nodes.Nora}`, rel: "participates_in", to: `existing:${cake}` },
          { from: cake, rel: "origin", to: `existing:${foreign.data.id}` }] } });
    expect(applied.edgeIds).toHaveLength(2);
    expect(applied.nodeIds).toContain(cake);
    const edges = await sb.from("graph_edges").select("to_node").eq("family_id", familyId).eq("rel", "origin");
    expect(edges.data).toHaveLength(1);
    expect(edges.data![0].to_node).not.toBe(foreign.data.id);
    const provenance = await sb.from("provenance").select("id").eq("memory_id", memory.data.id).eq("node_id", cake);
    expect(provenance.data?.length).toBeGreaterThan(0);
  });

  it("contributes, recognizes, stays silent, asks, learns, and replays the known person", async () => {
    const sb = state.client!;
    const seeded = await seedDemo(sb, "kin-integration");
    const nora = seeded.nodes.Nora;
    const descriptor = Array(128).fill(0.01);
    const contributors = [seeded.relatives.maya, seeded.relatives.elena];
    for (const [index, contributor] of contributors.entries()) {
      await json(await photo(formRequest({ contributor_id: contributor, consent: "true", labels: JSON.stringify([{ person_node_id: nora, descriptor }]) }, "photo fixture")));
      await json(await story(formRequest({ contributor_id: contributor }, index === 0
        ? "Nora and Rosa baked lemon cake every Sunday."
        : "Nora taught Rosa to bake lemon cake.")));
    }
    const enrollment = await sb.from("face_embeddings").select("contributor_id").eq("family_id", "kin-integration");
    expect(enrollment.error).toBeNull();
    expect(enrollment.data?.length).toBe(2);

    const known = await json(await recall(formRequest({ faceDescriptors: JSON.stringify([descriptor]) })));
    expect(known.decision).toBe("speak");
    expect(known.cueText).toContain("That's Nora, your sister.");
    expect(known.cueSource.quote).toContain("lemon cake");
    expect(known.audio).toBeTruthy();

    const unknown = await json(await recall(formRequest({ faceDescriptors: JSON.stringify([Array(128).fill(1)]) })));
    expect(unknown.decision).toBe("silent");
    expect(unknown.audio).toBeUndefined();
    expect((await json(await replayTarget())).lastEventId).toBe(known.eventId);

    const question = (await json(await weaver())).question;
    expect(question.target_relative_id).toBe(seeded.relatives.david);
    expect(question.gap_type).toBe("missing_origin");
    const answered = await json(await answer(formRequest({ contributor_id: seeded.relatives.david, question_id: question.id },
      "The Sunday lemon cake recipe came from their mother in Italy.")));
    const origin = await sb.from("graph_edges").select("id").eq("family_id", "kin-integration").eq("rel", "origin");
    expect(origin.data?.length).toBe(1);
    const replay = await json(await recall(new Request("http://localhost/api/recall", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ replayEventId: known.eventId }),
    })));
    expect(replay.decision).toBe("speak");
    expect(replay.cueText).toContain("Italy");
    expect(replay.cueSource.memoryId).toBe(answered.memory_id);
    const event = await sb.from("recall_events").select("*").eq("id", replay.eventId).single();
    expect(event.data.status).toBe("speak");
    expect(event.data.keeper_results.filter((r: { claim: unknown }) => r.claim).length).toBe(2);
    expect(event.data.keeper_results.filter((r: { claim: unknown }) => r.claim)
      .every((r: { evidence: unknown[] }) => r.evidence.length > 0)).toBe(true);

    const remove = (id: string, contributor: string) => removeMemory(new Request(
      `http://localhost/api/memories/${id}?contributor_id=${contributor}`, { method: "DELETE" }), { params: Promise.resolve({ id }) });
    expect((await remove(answered.memory_id, seeded.relatives.maya)).status).toBe(404);
    state.failStorageDelete = true;
    expect((await remove(answered.memory_id, seeded.relatives.david)).status).toBe(500);
    expect((await sb.from("memories").select("id").eq("id", answered.memory_id)).data).toHaveLength(1);
    state.failStorageDelete = false;
    await json(await remove(answered.memory_id, seeded.relatives.david));
    expect((await sb.from("memories").select("id").eq("id", answered.memory_id)).data).toHaveLength(0);
    expect((await sb.from("graph_edges").select("id").eq("family_id", "kin-integration").eq("rel", "origin")).data).toHaveLength(0);
    expect((await sb.from("graph_nodes").select("id").eq("family_id", "kin-integration").eq("label", "Italy")).data).toHaveLength(0);
    expect((await sb.from("weaver_questions").select("id").eq("id", question.id)).data).toHaveLength(0);
    const cleared = await sb.from("recall_events").select("status, cue_text, cue_source").eq("id", replay.eventId).single();
    expect(cleared.data).toEqual({ status: "silent", cue_text: null, cue_source: null });

    const photoMemory = await sb.from("memories").select("id, media_path").eq("contributor_id", seeded.relatives.maya).eq("kind", "photo").single();
    if (!photoMemory.data) throw new Error("Expected Maya's uploaded photo");
    await json(await remove(photoMemory.data.id, seeded.relatives.maya));
    expect(state.removedFiles).toContain(photoMemory.data.media_path);
    expect((await sb.from("face_embeddings").select("id").eq("family_id", "kin-integration")).data).toHaveLength(1);
    expect((await sb.from("provenance").select("id").eq("memory_id", photoMemory.data.id)).data).toHaveLength(0);
    expect((await sb.from("graph_nodes").select("id").eq("id", nora)).data).toHaveLength(1);
    expect((await sb.from("graph_edges").select("id").eq("from_node", nora).eq("rel", "participates_in")).data).toHaveLength(1);
    expect((await json(await recall(formRequest({ faceDescriptors: JSON.stringify([descriptor]) })))).decision).toBe("silent");
    expect((await remove(photoMemory.data.id, seeded.relatives.maya)).status).toBe(404);
  });
});
