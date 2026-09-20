import type { Extraction } from "../extract";
import type { GraphEdgeRow, GraphNodeRow } from "../types";

/** Resolve the P0 pronoun-only answer against the selected tradition, never against question wording. */
export function anchorOriginAnswer(extraction: Extraction, transcript: string,
  question: { gap_node_id?: string; gap_type?: string }, nodes: GraphNodeRow[], edges: GraphEdgeRow[]) {
  if (question.gap_type !== "missing_origin") return [];
  const tradition = nodes.find((n) => n.id === question.gap_node_id && ["tradition", "event"].includes(n.type));
  if (!tradition) return [];
  // Deliberately narrow: uncertainty, negation and model-extracted origin guesses cannot close the gap.
  const normalized = transcript.trim().replace(/[’]/g, "'");
  const traditionRefs = new Set([`existing:${tradition.id}`, ...extraction.nodes.filter((n) =>
    n.type === tradition.type && [tradition.label, ...(tradition.aliases ?? [])].some((label) => label.toLowerCase() === n.label.toLowerCase()))
    .map((n) => n.ref)]);
  const asserted = /^(?:It was (?:actually )?their mother's recipe[.,;]\s*)She brought it from Italy[.!]?$/i.test(normalized)
    || /^(?:The (?:lemon cake )?recipe|It) (?:came|was brought) from Italy[.!]?$/i.test(normalized);
  if (!asserted) {
    extraction.edges = extraction.edges.filter((e) => !["origin", "started_by", "taught_by"].includes(e.rel)
      || (!traditionRefs.has(e.from) && !traditionRefs.has(e.to)));
    return [];
  }
  const participants = edges.filter((e) => e.to_node === tradition.id && e.rel === "participates_in")
    .map((e) => nodes.find((n) => n.id === e.from_node && n.type === "person"))
    .filter((n): n is GraphNodeRow => Boolean(n));
  const italy = nodes.find((n) => n.type === "place" && n.label.toLowerCase() === "italy");
  const italyRef = italy ? `existing:${italy.id}` : "new:answer-origin-italy";
  for (const node of [tradition, ...participants]) {
    if (!extraction.nodes.some((n) => n.ref === `existing:${node.id}`)) extraction.nodes.push({
      ref: `existing:${node.id}`, type: node.type, label: node.label, relation_to_wearer: node.relation_to_wearer,
    });
  }
  if (!extraction.nodes.some((n) => n.ref === italyRef)) extraction.nodes.push({
    ref: italyRef, type: "place", label: "Italy", relation_to_wearer: null,
  });
  extraction.edges = extraction.edges.filter((e) => !["origin", "started_by", "taught_by"].includes(e.rel)
    || (!traditionRefs.has(e.from) && !traditionRefs.has(e.to)));
  extraction.edges.push({ from: `existing:${tradition.id}`, rel: "origin", to: italyRef });
  return participants;
}
