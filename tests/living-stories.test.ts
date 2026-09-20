import { describe, expect, it } from "vitest";
import { planStory, storyEvidence, storyExcerpt, storyTopics, validAudioSegments, type StoryData, type StoryMemory } from "../lib/living-stories";

const topic = { id: "cake", family_id: "family", label: "Sunday lemon cake", type: "tradition" as const, aliases: [], relation_to_wearer: null };
const memory = (id: string, owner: string, date: string): StoryMemory => ({
  id, family_id: "family", contributor_id: owner, kind: "story", media_path: `${id}.webm`, mediaUrl: `/${id}.webm`,
  transcript: "We made lemon cake.", caption: null, summary: "Lemon cake", source_question_id: null, created_at: date,
});
function fixture(): StoryData {
  const memories = [memory("a", "maya", "2026-01-01"), memory("b", "maya", "2026-01-02"), memory("c", "elena", "2026-01-03")];
  return { nodes: [topic, { ...topic, id: "nora", type: "person", label: "Nora" }],
    edges: [{ id: "edge", family_id: "family", from_node: "nora", to_node: "cake", rel: "participates_in" }],
    memories, relatives: [], provenance: memories.map((m) => ({ id: m.id, memory_id: m.id, node_id: "cake", edge_id: null, contributor_id: m.contributor_id })) };
}

describe("Living Stories provenance and planning", () => {
  it("alternates relatives while retaining each person's chronology", () => {
    const data = fixture();
    expect(planStory(data, "cake").chapters.map((m) => m.id)).toEqual(["a", "c", "b"]);
    expect(storyTopics(data).map((t) => [t.node.id, t.voices])).toEqual([["cake", 2]]);
  });
  it("does not use shared keywords, dangling provenance or another contributor's claims", () => {
    const data = fixture();
    data.provenance = [{ id: "bad", memory_id: "a", node_id: "cake", edge_id: null, contributor_id: "elena" }];
    expect(planStory(data, "cake").chapters).toEqual([]);
    data.provenance.push({ id: "gone", memory_id: "deleted", node_id: "cake", edge_id: null, contributor_id: "maya" });
    expect(storyEvidence(data, "deleted").nodes.size).toBe(0);
  });
  it("includes both endpoints of an evidenced edge, never unsupported relationships", () => {
    const data = fixture();
    data.provenance = [{ id: "p", memory_id: "a", node_id: null, edge_id: "edge", contributor_id: "maya" }];
    expect([...storyEvidence(data, "a").nodes]).toEqual(["nora", "cake"]);
    expect([...storyEvidence(data, "b").edges]).toEqual([]);
    expect(planStory(data, "nora").chapters.map((m) => m.id)).toEqual(["a"]);
    data.nodes[1].family_id = "another-family";
    expect(storyEvidence(data, "a").edges.size).toBe(0);
  });
  it("retains differing accounts independently and drops deleted sources", () => {
    const data = fixture();
    data.memories[0].transcript = "The recipe came from Italy.";
    data.memories[2].transcript = "I remember the recipe coming from France.";
    expect(planStory(data, "cake").chapters.map((m) => m.transcript)).toContain(data.memories[2].transcript);
    data.memories = data.memories.filter((m) => m.id !== "a");
    expect(planStory(data, "cake").chapters.map((m) => m.id)).toEqual(["b", "c"]);
  });
  it("only pairs photos with an evidenced topic and retains transcript-only recordings", () => {
    const data = fixture();
    data.memories[0].mediaUrl = null;
    data.memories.push({ ...memory("photo", "maya", "2026-01-04"), kind: "photo", transcript: null });
    expect(planStory(data, "cake").photos).toEqual([]);
    data.provenance.push({ id: "photo", memory_id: "photo", node_id: "cake", edge_id: null, contributor_id: "maya" });
    expect(planStory(data, "cake").photos.map((m) => m.id)).toEqual(["photo"]);
    expect(planStory(data, "cake").chapters[0].id).toBe("a");
  });
});

describe("Original audio excerpts", () => {
  const segments = [
    { start: 0, end: 10, text: "It was always on Sundays." },
    { start: 11, end: 20, text: "Nora baked the lemon cake." },
    { start: 21, end: 30, text: "I can still remember the smell." },
    { start: 31, end: 45, text: "Then we went for a walk." },
  ];
  const transcript = segments.map((s) => s.text).join(" ");
  it("selects one continuous passage with context, not a fabricated quote", () => {
    const excerpt = storyExcerpt(segments, transcript, topic)!;
    expect(excerpt).toEqual({ start: 0, end: 30, text: segments.slice(0, 3).map((s) => s.text).join(" ") });
    expect(transcript).toContain(excerpt.text);
  });
  it("falls back to the full recording without valid timestamps or an explicit topic match", () => {
    expect(storyExcerpt(undefined, transcript, topic)).toBeNull();
    expect(storyExcerpt(segments, transcript, { ...topic, label: "Yellow apron" })).toBeNull();
    for (const bad of [NaN, Infinity, -1, 50]) {
      expect(validAudioSegments([{ ...segments[0], start: bad }], transcript)).toEqual([]);
    }
    expect(validAudioSegments([{ ...segments[0], text: "An invented sentence" }], transcript)).toEqual([]);
    expect(validAudioSegments([segments[1], segments[0]], transcript)).toEqual([]);
  });
  it("matches aliases and does not match partial words", () => {
    expect(storyExcerpt(segments, transcript, { ...topic, label: "Baking", aliases: ["lemon cake"] })).not.toBeNull();
    expect(storyExcerpt(segments, transcript, { ...topic, label: "ora" })).toBeNull();
  });
});
