import type { GraphNodeRow, VerifiedFact } from "../types";
import { stableId } from "./ids";

/** Only literal human text is eligible. Model summaries and vision captions never enter here. */
export function literalFacts(text: string, nodes: GraphNodeRow[], memoryId: string, contributorId: string): VerifiedFact[] {
  const spans = text.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  return nodes.flatMap((node) => spans.filter((span) =>
    [node.label, ...(node.aliases ?? [])].some((name) => name && new RegExp(
      `(^|[^\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}\\p{N}]|$)`, "iu").test(span))
  ).map((span) => ({ id: stableId(memoryId, node.id, span), subjectNodeId: node.id,
    text: span, sourceSpan: { start: text.indexOf(span), end: text.indexOf(span) + span.length }, memoryId, contributorId })));
}
