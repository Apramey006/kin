import type { GraphNodeRow, NodeType } from "./types";

export const ALLOWED_RELS = [
  "sibling_of",
  "child_of",
  "parent_of",
  "grandchild_of",
  "spouse_of",
  "friend_of",
  "participates_in",
  "started_by",
  "taught_by",
  "origin",
  "located_at",
  "wears",
  "owns",
  "made",
  "happens_on",
] as const;

export type AllowedRel = (typeof ALLOWED_RELS)[number];

export function isAllowedRel(rel: string): rel is AllowedRel {
  return (ALLOWED_RELS as readonly string[]).includes(rel);
}

export function normLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Resolution fallback: find an existing node of the same type whose label or
 * aliases match `label` case-insensitively.
 */
export function findNodeByLabel(
  nodes: GraphNodeRow[],
  type: NodeType,
  label: string
): GraphNodeRow | undefined {
  const target = normLabel(label);
  return nodes.find(
    (n) =>
      n.type === type &&
      (normLabel(n.label) === target ||
        (n.aliases ?? []).some((a) => normLabel(a) === target))
  );
}

/** Ids of every node connected to `nodeId` by any edge. */
export function neighborIds(
  nodeId: string,
  edges: { from_node: string; to_node: string }[]
): Set<string> {
  const out = new Set<string>();
  for (const e of edges) {
    if (e.from_node === nodeId) out.add(e.to_node);
    if (e.to_node === nodeId) out.add(e.from_node);
  }
  return out;
}
