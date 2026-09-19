import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chatJSON } from "./providers/openai";
import { CONFIG } from "./config";
import { findNodeByLabel, isAllowedRel, normLabel, ALLOWED_RELS } from "./graph";
import type { GraphNodeRow, NodeType } from "./types";

const NODE_TYPES = ["person", "event", "tradition", "object", "place"] as const;

const extractionZod = z.object({
  summary: z.string(),
  nodes: z.array(
    z.object({
      ref: z.string(),
      type: z.enum(NODE_TYPES),
      label: z.string(),
      relation_to_wearer: z.string().nullable(),
    })
  ),
  edges: z.array(
    z.object({ from: z.string(), rel: z.string(), to: z.string() })
  ),
});

export type Extraction = z.infer<typeof extractionZod>;

const extractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "nodes", "edges"],
  properties: {
    summary: { type: "string" },
    nodes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ref", "type", "label", "relation_to_wearer"],
        properties: {
          ref: { type: "string" },
          type: { type: "string", enum: NODE_TYPES },
          label: { type: "string" },
          relation_to_wearer: { type: ["string", "null"] },
        },
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["from", "rel", "to"],
        properties: {
          from: { type: "string" },
          rel: { type: "string" },
          to: { type: "string" },
        },
      },
    },
  },
} as const;

export interface ExtractOpts {
  text: string;
  wearerName: string;
  contributorName: string;
  contributorRelation: string;
  existingNodes: GraphNodeRow[];
  /** for Weaver answers: the question being answered */
  questionContext?: string;
}

export async function extractMemory(opts: ExtractOpts): Promise<Extraction> {
  const nodeList = opts.existingNodes
    .map((n) => `${n.id} | ${n.type} | ${n.label} | aliases: ${(n.aliases ?? []).join(", ")}`)
    .join("\n");
  const system = `You extract structured family memories for an app called Kin.
Rules:
- Extract only what the text states. Never invent facts.
- Reuse an existing node (ref "existing:<id>") when the text refers to the same entity. Otherwise use ref "new:<short-tmp-name>".
- "Grandma", "Nana", "Mom", "Dad" etc. are relative to the speaker's relationship to the wearer (${opts.wearerName}). The speaker is ${opts.contributorName} (${opts.contributorRelation} of ${opts.wearerName}).
- The wearer ${opts.wearerName} is a person node with relation_to_wearer "self".
- Edge rel must be one of: ${ALLOWED_RELS.join(", ")}.
- summary: one sentence, third person, faithful to the text.`;
  const user = `${opts.questionContext ? `This text answers the question: "${opts.questionContext}"\n\n` : ""}Existing nodes:\n${nodeList || "(none)"}\n\nText:\n${opts.text}`;
  return chatJSON<Extraction>({
    name: "memory_extraction",
    jsonSchema: extractionJsonSchema,
    zodSchema: extractionZod,
    system,
    user,
    timeoutMs: CONFIG.timeouts.extractionMs,
  });
}

export interface AppliedExtraction {
  nodeIds: string[];
  edgeIds: string[];
  chips: { label: string; type: NodeType; relation_to_wearer: string | null }[];
}

/** Make sure the wearer exists as a person node with relation_to_wearer 'self'. */
export async function ensureWearerNode(
  sb: SupabaseClient,
  familyId: string,
  wearerName: string
): Promise<GraphNodeRow> {
  const { data: existing } = await sb
    .from("graph_nodes")
    .select("*")
    .eq("family_id", familyId)
    .eq("type", "person")
    .eq("relation_to_wearer", "self")
    .limit(1);
  if (existing?.length) return existing[0] as GraphNodeRow;
  const { data, error } = await sb
    .from("graph_nodes")
    .insert({
      family_id: familyId,
      type: "person",
      label: wearerName,
      relation_to_wearer: "self",
    })
    .select()
    .single();
  if (error) throw error;
  return data as GraphNodeRow;
}

/**
 * Resolve extraction refs to real node ids, insert missing nodes/edges,
 * and write provenance for everything. Returns chips for the UI.
 */
export async function applyExtraction(
  sb: SupabaseClient,
  opts: {
    familyId: string;
    contributorId: string;
    memoryId: string;
    extraction: Extraction;
    wearerName: string;
  }
): Promise<AppliedExtraction> {
  const { familyId, contributorId, memoryId, extraction } = opts;
  const wearerNode = await ensureWearerNode(sb, familyId, opts.wearerName);
  const { data: allNodes } = await sb
    .from("graph_nodes")
    .select("*")
    .eq("family_id", familyId);
  const nodes = (allNodes ?? []) as GraphNodeRow[];

  const refToId = new Map<string, string>();
  const chips: AppliedExtraction["chips"] = [];
  const provenance: {
    memory_id: string;
    contributor_id: string;
    node_id?: string;
    edge_id?: string;
  }[] = [];

  for (const n of extraction.nodes) {
    let id: string | null = null;
    if (n.ref.startsWith("existing:")) {
      const candidate = n.ref.slice("existing:".length);
      if (nodes.some((x) => x.id === candidate)) id = candidate;
    }
    if (
      !id &&
      (normLabel(n.label) === normLabel(opts.wearerName) ||
        n.relation_to_wearer === "self")
    ) {
      id = wearerNode.id;
    }
    if (!id) {
      const match = findNodeByLabel(nodes, n.type, n.label);
      if (match) id = match.id;
    }
    if (!id) {
      const { data, error } = await sb
        .from("graph_nodes")
        .insert({
          family_id: familyId,
          type: n.type,
          label: n.label,
          relation_to_wearer:
            n.type === "person" ? n.relation_to_wearer : null,
        })
        .select()
        .single();
      if (error) throw error;
      id = data.id as string;
      nodes.push(data as GraphNodeRow);
    }
    refToId.set(n.ref, id);
    chips.push({
      label: nodes.find((x) => x.id === id)?.label ?? n.label,
      type: n.type,
      relation_to_wearer: n.relation_to_wearer,
    });
    provenance.push({ memory_id: memoryId, contributor_id: contributorId, node_id: id });
  }

  const edgeIds: string[] = [];
  for (const e of extraction.edges) {
    const from = refToId.get(e.from);
    const to = refToId.get(e.to);
    if (!from || !to || !isAllowedRel(e.rel)) continue;
    const { data: dup } = await sb
      .from("graph_edges")
      .select("id")
      .eq("from_node", from)
      .eq("rel", e.rel)
      .eq("to_node", to)
      .limit(1);
    let edgeId = dup?.[0]?.id as string | undefined;
    if (!edgeId) {
      const { data, error } = await sb
        .from("graph_edges")
        .insert({ family_id: familyId, from_node: from, rel: e.rel, to_node: to })
        .select()
        .single();
      if (error) throw error;
      edgeId = data.id as string;
    }
    edgeIds.push(edgeId);
    provenance.push({ memory_id: memoryId, contributor_id: contributorId, edge_id: edgeId });
  }

  if (provenance.length) {
    await sb.from("provenance").insert(provenance);
  }

  return { nodeIds: [...refToId.values()], edgeIds, chips };
}
