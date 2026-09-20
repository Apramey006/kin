import { CONFIG } from "./config";
import { wordCount } from "./util";
import type { GraphEdgeRow, GraphNodeRow } from "./types";

export function identitySentence(subject: {
  label: string; type: string; relation_to_wearer: string | null;
}): string {
  return subject.type === "person" && subject.relation_to_wearer && subject.relation_to_wearer !== "self"
    ? `That's ${subject.label}, your ${subject.relation_to_wearer}.`
    : `That's ${subject.label}.`;
}

export interface ContextPath { node: GraphNodeRow; edges: GraphEdgeRow[] }
export function pickContextPath(subjectId: string, nodes: GraphNodeRow[], edges: GraphEdgeRow[]): ContextPath | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const participation = edges.find((e) => e.from_node === subjectId && e.rel === "participates_in" &&
    ["tradition", "event"].includes(byId.get(e.to_node)?.type ?? ""));
  if (!participation) return null;
  const node = byId.get(participation.to_node)!;
  return { node, edges: [participation, ...edges.filter((e) =>
    e.from_node === node.id && ["origin", "started_by", "taught_by"].includes(e.rel))] };
}

export interface CueMemory {
  id: string;
  contributorName: string;
  kind: string;
  transcript: string | null;
  created_at: string;
  /** True only for a recorded answer to a question about this subject/context. */
  answersContext: boolean;
}

/** Whole, verbatim sentences only. No model rewrite or invented fallback facts. */
export function excerpt(text: string, budget: number): string | null {
  const sentences = text.trim().match(/[^.!?]+[.!?]+["”']?|[^.!?]+$/g) ?? [];
  let quote = "";
  for (const sentence of sentences) {
    const candidate = `${quote} ${sentence.trim()}`.trim();
    if (wordCount(candidate) > budget) break;
    quote = candidate;
  }
  return quote || null;
}

export function synthesizeCue(subject: GraphNodeRow, memories: CueMemory[]): {
  text: string;
  source: { memoryId: string; contributorName: string; quote: string } | null;
} {
  const identity = identitySentence(subject);
  const ordered = [...memories].sort((a, b) =>
    Number(b.answersContext) - Number(a.answersContext) || b.created_at.localeCompare(a.created_at));
  for (const memory of ordered) {
    if (!memory.transcript?.trim()) continue;
    const intro = `${memory.contributorName} remembers:`;
    const budget = CONFIG.cue.maxWords - wordCount(identity) - wordCount(intro);
    const quote = excerpt(memory.transcript, budget);
    if (!quote) continue;
    return {
      text: `${identity} ${intro} “${quote}”`,
      source: { memoryId: memory.id, contributorName: memory.contributorName, quote },
    };
  }
  return { text: identity, source: null };
}
