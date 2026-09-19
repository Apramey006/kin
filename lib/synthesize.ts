import { CONFIG } from "./config";
import { wordCount } from "./util";
import type { GraphEdgeRow, GraphNodeRow } from "./types";

export function identitySentence(subject: {
  label: string;
  type: string;
  relation_to_wearer: string | null;
}): string {
  if (
    subject.type === "person" &&
    subject.relation_to_wearer &&
    subject.relation_to_wearer !== "self"
  ) {
    return `That's ${subject.label}, your ${subject.relation_to_wearer}.`;
  }
  return `That's ${subject.label}.`;
}

export interface ContextPath {
  /** the tradition/event node the subject participates in */
  node: GraphNodeRow;
  /** all edges used as grounding evidence (participates_in + origin etc.) */
  edges: GraphEdgeRow[];
}

/**
 * Prefer participates_in -> tradition/event, then append that node's
 * origin / started_by / taught_by edge when one exists.
 */
export function pickContextPath(
  subjectId: string,
  nodes: GraphNodeRow[],
  edges: GraphEdgeRow[]
): ContextPath | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const participation = edges.find(
    (e) =>
      e.from_node === subjectId &&
      e.rel === "participates_in" &&
      ["tradition", "event"].includes(byId.get(e.to_node)?.type ?? "")
  );
  if (!participation) return null;
  const node = byId.get(participation.to_node)!;
  const supporting = [participation];
  const origin = edges.find(
    (e) =>
      (e.from_node === node.id || e.to_node === node.id) &&
      ["origin", "started_by", "taught_by"].includes(e.rel)
  );
  if (origin) supporting.push(origin);
  return { node, edges: supporting };
}

/**
 * Grounding validator: every capitalized word (except sentence-initial words
 * and "You") and every number in `text` must appear in the supplied corpus
 * (memory summaries + node labels + aliases).
 */
export function validateGrounding(text: string, corpus: string[]): boolean {
  const corpusTokens = new Set(
    corpus
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9']+/)
      .filter(Boolean)
  );
  const tokens = text.split(/\s+/).filter(Boolean);
  let sentenceStart = true;
  for (const raw of tokens) {
    const word = raw.replace(/^[^\w']+|[^\w']+$/g, "");
    const isSentenceStart = sentenceStart;
    if (/[.!?]["')]*$/.test(raw)) sentenceStart = true;
    else sentenceStart = false;
    if (!word) continue;
    if (/\d/.test(word)) {
      if (!corpusTokens.has(word.toLowerCase())) return false;
      continue;
    }
    if (!isSentenceStart && /^[A-Z]/.test(word) && word !== "You") {
      if (!corpusTokens.has(word.toLowerCase())) return false;
    }
  }
  return true;
}

export interface SynthesizeInput {
  subject: GraphNodeRow;
  nodes: GraphNodeRow[];
  edges: GraphEdgeRow[];
  /** memory summaries providing provenance for the context path edges */
  contextSummaries: string[];
  wearerName: string;
  /** LLM rewrite; injected so tests can supply a fake */
  rewrite: (summaries: string[], wearerName: string) => Promise<string>;
}

export interface CueResult {
  text: string;
  grounded: boolean;
}

export async function synthesizeCue(input: SynthesizeInput): Promise<CueResult> {
  const identity = identitySentence(input.subject);
  const path = pickContextPath(input.subject.id, input.nodes, input.edges);

  if (!path || input.contextSummaries.length === 0) {
    return { text: identity, grounded: true };
  }

  const corpus = [
    ...input.contextSummaries,
    ...input.nodes.flatMap((n) => [n.label, ...(n.aliases ?? [])]),
    input.subject.label,
    input.wearerName,
  ];

  let context: string | null = null;
  let grounded = true;
  try {
    const draft = await input.rewrite(input.contextSummaries, input.wearerName);
    if (
      validateGrounding(draft, corpus) &&
      wordCount(draft) <= CONFIG.cue.contextMaxWords + 6
    ) {
      context = draft;
    } else {
      grounded = false;
    }
  } catch {
    grounded = false;
  }

  if (!context) {
    context = `You two ${lowercaseFirst(path.node.label)}.`;
  }

  let text = `${identity} ${context}`;
  if (wordCount(text) > CONFIG.cue.maxWords) text = identity;
  return { text, grounded };
}

function lowercaseFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
