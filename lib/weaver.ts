import type { SupabaseClient } from "@supabase/supabase-js";
import { chatJSON } from "./providers/openai";
import { neighborIds } from "./graph";
import { z } from "zod";
import type {
  GraphEdgeRow,
  GraphNodeRow,
  MemoryRow,
  ProvenanceRow,
  Relative,
} from "./types";

export type GapType = "missing_origin" | "orphan_object" | "unrelated_person";

export interface Gap {
  type: GapType;
  nodeId: string;
}

export interface WeaverData {
  nodes: GraphNodeRow[];
  edges: GraphEdgeRow[];
  provenance: ProvenanceRow[];
  memories: Pick<MemoryRow, "id" | "contributor_id" | "kind" | "summary">[];
  /** person node ids that have at least one enrolled face */
  facePersonIds: string[];
  wearerNodeId: string | null;
  relatives: Relative[];
  openQuestionRelativeIds: string[];
}

const GAP_ORDER: GapType[] = [
  "missing_origin",
  "orphan_object",
  "unrelated_person",
];
const ORIGIN_RELS = new Set(["origin", "started_by", "taught_by"]);

function edgesTouching(nodeId: string, edges: GraphEdgeRow[]) {
  return edges.filter(
    (e) => e.from_node === nodeId || e.to_node === nodeId
  );
}

/** distinct contributors whose memories provide provenance for a node or its edges */
function contributorsOf(d: WeaverData, nodeId: string): Set<string> {
  const edgeIds = new Set(edgesTouching(nodeId, d.edges).map((e) => e.id));
  const out = new Set<string>();
  for (const p of d.provenance) {
    if (p.node_id === nodeId || (p.edge_id && edgeIds.has(p.edge_id))) {
      out.add(p.contributor_id);
    }
  }
  return out;
}

function memoryIdsTouchingNode(d: WeaverData, nodeId: string): Set<string> {
  const edgeIds = new Set(edgesTouchingNodeIds(d, nodeId).map((e) => e.id));
  const out = new Set<string>();
  for (const p of d.provenance) {
    if (p.node_id === nodeId || (p.edge_id && edgeIds.has(p.edge_id))) {
      out.add(p.memory_id);
    }
  }
  return out;
}

function edgesTouchingNodeIds(d: WeaverData, nodeId: string) {
  return edgesTouching(nodeId, d.edges);
}

/** Rule-based gap detection. Types are checked in a fixed order. */
export function findGaps(d: WeaverData): Gap[] {
  const gaps: Gap[] = [];
  const byId = new Map(d.nodes.map((n) => [n.id, n]));

  for (const n of d.nodes) {
    if (n.type !== "tradition" && n.type !== "event") continue;
    const incoming = d.edges.filter(
      (e) => e.to_node === n.id && e.rel === "participates_in"
    ).length;
    const hasOrigin = edgesTouching(n.id, d.edges).some((e) =>
      ORIGIN_RELS.has(e.rel)
    );
    if (incoming >= 2 && !hasOrigin) {
      gaps.push({ type: "missing_origin", nodeId: n.id });
    }
  }

  for (const n of d.nodes) {
    if (n.type !== "object") continue;
    const memoryCount = new Set(
      d.provenance.filter((p) => p.node_id === n.id).map((p) => p.memory_id)
    ).size;
    if (memoryCount !== 1) continue;
    const linked = edgesTouching(n.id, d.edges).some((e) => {
      const other = byId.get(e.from_node === n.id ? e.to_node : e.from_node);
      return (
        other && ["tradition", "event", "place"].includes(other.type)
      );
    });
    if (!linked) gaps.push({ type: "orphan_object", nodeId: n.id });
  }

  for (const n of d.nodes) {
    if (n.type !== "person") continue;
    if (!d.facePersonIds.includes(n.id)) continue;
    if (n.relation_to_wearer) continue;
    const touchesWearer =
      d.wearerNodeId &&
      d.edges.some(
        (e) =>
          (e.from_node === n.id && e.to_node === d.wearerNodeId) ||
          (e.to_node === n.id && e.from_node === d.wearerNodeId)
      );
    if (!touchesWearer) gaps.push({ type: "unrelated_person", nodeId: n.id });
  }

  return gaps;
}

/** degree(node) + 2 * distinct contributors providing provenance for it */
export function gapScore(d: WeaverData, gap: Gap): number {
  const degree = edgesTouching(gap.nodeId, d.edges).length;
  return degree + 2 * contributorsOf(d, gap.nodeId).size;
}

export function pickTopGap(d: WeaverData): Gap | null {
  const gaps = findGaps(d);
  if (!gaps.length) return null;
  return gaps.sort((a, b) => {
    const diff = gapScore(d, b) - gapScore(d, a);
    if (diff !== 0) return diff;
    return GAP_ORDER.indexOf(a.type) - GAP_ORDER.indexOf(b.type);
  })[0];
}

/**
 * Who to ask. Relatives whose memories already describe the gap node itself
 * are skipped: the point is to ask someone whose contributions sit NEXT to
 * the gap. Ties go to a relative who uploaded a related photo.
 */
export function routeQuestion(d: WeaverData, gap: Gap): string | null {
  const neighbors = neighborIds(gap.nodeId, d.edges);
  const describers = contributorsOf(d, gap.nodeId);
  const open = new Set(d.openQuestionRelativeIds);

  let candidates = d.relatives.filter(
    (r) => !open.has(r.id) && !describers.has(r.id)
  );
  if (!candidates.length) {
    candidates = d.relatives.filter((r) => !open.has(r.id));
  }
  if (!candidates.length) return null;

  const memoriesByContributor = new Map<string, typeof d.memories>();
  for (const m of d.memories) {
    const list = memoriesByContributor.get(m.contributor_id) ?? [];
    list.push(m);
    memoriesByContributor.set(m.contributor_id, list);
  }

  const neighborEdgeIds = new Set<string>();
  for (const nid of neighbors) {
    edgesTouching(nid, d.edges).forEach((e) => neighborEdgeIds.add(e.id));
  }
  const touchesNeighbor = (memoryId: string) =>
    d.provenance.some(
      (p) =>
        p.memory_id === memoryId &&
        ((p.node_id && neighbors.has(p.node_id)) ||
          (p.edge_id && neighborEdgeIds.has(p.edge_id)))
    );
  const touchesGap = (memoryId: string) =>
    memoryIdsTouchingNode(d, gap.nodeId).has(memoryId);

  const scored = candidates.map((r) => {
    const mems = memoriesByContributor.get(r.id) ?? [];
    const neighborMems = mems.filter((m) => touchesNeighbor(m.id));
    const gapMems = mems.filter((m) => touchesGap(m.id));
    const score = 2 * neighborMems.length + gapMems.length;
    const hasRelatedPhoto = [...neighborMems, ...gapMems].some(
      (m) => m.kind === "photo"
    );
    return { relative: r, score, hasRelatedPhoto };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.hasRelatedPhoto !== b.hasRelatedPhoto) return a.hasRelatedPhoto ? -1 : 1;
    return 0;
  });
  return scored[0]?.relative.id ?? null;
}

const questionZod = z.object({ question: z.string() });

/** Full DB-backed Weaver run: detect gap, pick target, phrase, insert. */
export async function runWeaver(
  sb: SupabaseClient,
  familyId: string
): Promise<{ question: Record<string, unknown> | null; gap: Gap | null }> {
  const [nodes, edges, prov, mems, faces, relatives, questions, wearer] =
    await Promise.all([
      sb.from("graph_nodes").select("*").eq("family_id", familyId),
      sb.from("graph_edges").select("*").eq("family_id", familyId),
      sb.from("provenance").select("*"),
      sb.from("memories").select("id, contributor_id, kind, summary").eq("family_id", familyId),
      sb.from("face_embeddings").select("person_node_id").eq("family_id", familyId),
      sb.from("relatives").select("*").eq("family_id", familyId),
      sb.from("weaver_questions").select("target_relative_id").eq("family_id", familyId).eq("status", "open"),
      sb.from("graph_nodes").select("id").eq("family_id", familyId).eq("relation_to_wearer", "self").limit(1),
    ]);

  const memoryRows = (mems.data ?? []) as WeaverData["memories"];
  const memFamily = new Set(memoryRows.map((m) => m.id));
  const data: WeaverData = {
    nodes: (nodes.data ?? []) as GraphNodeRow[],
    edges: (edges.data ?? []) as GraphEdgeRow[],
    provenance: ((prov.data ?? []) as ProvenanceRow[]).filter((p) =>
      memFamily.has(p.memory_id)
    ),
    memories: memoryRows,
    facePersonIds: (faces.data ?? []).map((f) => f.person_node_id),
    wearerNodeId: wearer.data?.[0]?.id ?? null,
    relatives: (relatives.data ?? []) as Relative[],
    openQuestionRelativeIds: (questions.data ?? []).map(
      (q) => q.target_relative_id
    ),
  };

  const gap = pickTopGap(data);
  if (!gap) return { question: null, gap: null };
  const targetId = routeQuestion(data, gap);
  if (!targetId) return { question: null, gap };

  const gapNode = data.nodes.find((n) => n.id === gap.nodeId)!;
  const evidenceIds = [...memoryIdsTouchingNode(data, gap.nodeId)].slice(0, 3);
  const evidence = evidenceIds
    .map((id) => {
      const m = data.memories.find((x) => x.id === id);
      return m
        ? { memory_id: m.id, contributor_id: m.contributor_id, summary: m.summary }
        : null;
    })
    .filter(Boolean) as { memory_id: string; contributor_id: string; summary: string }[];
  // Neighbor memories make good evidence too when the gap itself is thin.
  if (evidence.length < 2) {
    const neighbors = neighborIds(gap.nodeId, data.edges);
    for (const m of data.memories) {
      if (evidence.length >= 3) break;
      if (evidence.some((e) => e.memory_id === m.id)) continue;
      const touches = data.provenance.some(
        (p) => p.memory_id === m.id && p.node_id && neighbors.has(p.node_id)
      );
      if (touches) {
        evidence.push({
          memory_id: m.id,
          contributor_id: m.contributor_id,
          summary: m.summary,
        });
      }
    }
  }

  const nameOf = (id: string) =>
    data.relatives.find((r) => r.id === id)?.name ?? "Someone";
  const evidenceText = evidence
    .map((e) => `${nameOf(e.contributor_id)}: "${e.summary}"`)
    .join("\n");

  let questionText: string;
  try {
    const res = await chatJSON<{ question: string }>({
      name: "weaver_question",
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["question"],
        properties: { question: { type: "string" } },
      },
      zodSchema: questionZod,
      system:
        "You are the Kin Family Weaver. You ask one relative a warm, low-pressure question to fill a gap in the family memory. One or two sentences. Cite who said what. End with a specific question. No pressure, no guilt.",
      user: `Gap type: ${gap.type}\nNode: "${gapNode.label}" (${gapNode.type})\nEvidence:\n${evidenceText || "(no direct evidence)"}\n\nWrite the question.`,
    });
    questionText = res.question;
  } catch {
    questionText = `The family remembers "${gapNode.label}" but no one has recorded where it came from. Do you remember?`;
  }

  const { data: row, error } = await sb
    .from("weaver_questions")
    .insert({
      family_id: familyId,
      target_relative_id: targetId,
      gap_node_id: gap.nodeId,
      gap_type: gap.type,
      question_text: questionText,
      evidence,
    })
    .select()
    .single();
  if (error) throw error;
  return { question: row, gap };
}
