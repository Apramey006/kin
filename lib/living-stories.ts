import type { GraphNodeRow, GraphEdgeRow, MemoryRow, ProvenanceRow, Relative } from "./types";

export interface AudioSegment { start: number; end: number; text: string }
export type StoryMemory = MemoryRow & { mediaUrl: string | null };
export interface StoryData {
  nodes: GraphNodeRow[];
  edges: GraphEdgeRow[];
  memories: StoryMemory[];
  provenance: ProvenanceRow[];
  relatives: Relative[];
}

/** Only a memory's own provenance can illuminate a connection. */
export function storyEvidence(data: StoryData, memoryId: string) {
  const memory = data.memories.find((m) => m.id === memoryId);
  const nodes = new Set<string>();
  const edges = new Set<string>();
  if (!memory) return { nodes, edges };
  const validNodes = new Set(data.nodes.filter((n) => n.family_id === memory.family_id).map((n) => n.id));
  for (const p of data.provenance) {
    if (p.memory_id !== memoryId || p.contributor_id !== memory.contributor_id) continue;
    if (p.node_id && validNodes.has(p.node_id)) nodes.add(p.node_id);
    const edge = data.edges.find((e) => e.id === p.edge_id && e.family_id === memory.family_id);
    if (edge && validNodes.has(edge.from_node) && validNodes.has(edge.to_node)) {
      edges.add(edge.id);
      nodes.add(edge.from_node);
      nodes.add(edge.to_node);
    }
  }
  return { nodes, edges };
}

export function storySources(data: StoryData, topicId: string) {
  return data.memories.filter((m) => storyEvidence(data, m.id).nodes.has(topicId))
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

/** Round-robin voices, preserving each person's chronology and every source. */
export function planStory(data: StoryData, topicId: string) {
  const sources = storySources(data, topicId);
  const recordings = sources.filter((m) => m.kind !== "photo" && m.transcript?.trim());
  const groups = new Map<string, StoryMemory[]>();
  for (const memory of recordings) {
    groups.set(memory.contributor_id, [...(groups.get(memory.contributor_id) ?? []), memory]);
  }
  const chapters: StoryMemory[] = [];
  while ([...groups.values()].some((group) => group.length)) {
    for (const group of groups.values()) {
      const next = group.shift();
      if (next) chapters.push(next);
    }
  }
  return { chapters, photos: sources.filter((m) => m.kind === "photo" && m.mediaUrl) };
}

export function storyTopics(data: StoryData) {
  return data.nodes.map((node) => {
    const { chapters, photos } = planStory(data, node.id);
    return { node, chapters, photos, voices: new Set(chapters.map((m) => m.contributor_id)).size };
  }).filter((t) => t.chapters.length > 0).sort((a, b) =>
    b.voices - a.voices || b.chapters.length - a.chapters.length || a.node.label.localeCompare(b.node.label));
}

export function validAudioSegments(value: unknown, transcript: string): AudioSegment[] {
  if (!Array.isArray(value)) return [];
  let previousEnd = 0;
  const result: AudioSegment[] = [];
  for (const item of value) {
    if (!item || typeof item.start !== "number" || typeof item.end !== "number" ||
      !Number.isFinite(item.start) || !Number.isFinite(item.end) || item.start < previousEnd ||
      item.end <= item.start || typeof item.text !== "string" || !item.text.trim() ||
      !transcript.includes(item.text.trim())) return [];
    result.push({ start: item.start, end: item.end, text: item.text.trim() });
    previousEnd = item.end;
  }
  return result;
}

/** One continuous passage; never assemble a new sentence out of separate clips. */
export function storyExcerpt(value: unknown, transcript: string, topic: GraphNodeRow): AudioSegment | null {
  const segments = validAudioSegments(value, transcript);
  const terms = new Set([topic.label, ...topic.aliases].join(" ").toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2 && !["the", "and", "our", "with", "from"].includes(word)));
  const score = (text: string) => text.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u)
    .filter((word) => terms.has(word)).length;
  const best = segments.reduce((index, segment, i) =>
    score(segment.text) > (index < 0 ? 0 : score(segments[index].text)) ? i : index, -1);
  if (best < 0) return null;
  let first = best;
  let last = best;
  if (first > 0 && segments[last].end - segments[first - 1].start <= 35) first--;
  if (last + 1 < segments.length && segments[last + 1].end - segments[first].start <= 35) last++;
  const startText = transcript.indexOf(segments[first].text);
  const endText = transcript.indexOf(segments[last].text, startText) + segments[last].text.length;
  if (endText <= startText) return null;
  return { start: segments[first].start, end: segments[last].end, text: transcript.slice(startText, endText) };
}
