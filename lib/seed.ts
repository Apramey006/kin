import type { SupabaseClient } from "@supabase/supabase-js";
import { embedText } from "./providers/openai";
import { CONFIG } from "./config";
import { zeroVector } from "./util";
import { stableId } from "./ingestion/ids";
import { literalFacts } from "./ingestion/facts";
import type { GraphNodeRow, GraphEdgeRow } from "./types";

import { DEMO_FAMILY_ID, DEMO_CONTRIBUTOR_IDS } from "./demo";
import baseline from "../demo/shared-baseline.json";

export function demoContributorIds(familyId: string) {
  if (familyId === DEMO_FAMILY_ID) return { ...DEMO_CONTRIBUTOR_IDS };
  return Object.fromEntries(["maya", "david", "elena"].map((name) => [name, stableId(familyId, "demo-relative", name)])) as Record<"maya" | "david" | "elena", string>;
}

/** Recursively list before deleting, with pagination and no silently ignored storage errors. */
export async function resetFamily(sb: SupabaseClient, familyId: string) {
  if (!familyId || familyId.includes("/") || familyId.includes("..")) throw new Error("Invalid family storage prefix");
  const bucket = sb.storage.from(CONFIG.storageBucket);
  const paths: string[] = [];
  async function visit(prefix: string) {
    for (let offset = 0; ; offset += 100) {
      const result = await bucket.list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
      if (result.error) throw result.error;
      for (const entry of result.data ?? []) {
        if (!entry.name || entry.name.includes("/")) throw new Error("Invalid storage entry");
        if (entry.id) paths.push(`${prefix}/${entry.name}`);
        else await visit(`${prefix}/${entry.name}`);
      }
      if ((result.data?.length ?? 0) < 100) break;
    }
  }
  await visit(familyId);
  for (let i = 0; i < paths.length; i += 100) {
    const result = await bucket.remove(paths.slice(i, i + 100));
    if (result.error) throw result.error;
  }
  const pending = await sb.from("pending_contributions").delete().eq("family_id", familyId);
  if (pending.error && !["42P01", "PGRST205"].includes(pending.error.code)) throw pending.error;
  const window = await sb.from("relatives").update({ self_capture_open: true }).eq("family_id", familyId).eq("is_self", true);
  if (window.error && !["42703", "PGRST204"].includes(window.error.code)) throw window.error;
  for (const table of ["weaver_questions", "recall_events", "ingestion_receipts", "face_embeddings", "memories", "graph_edges", "graph_nodes"]) {
    const result = await sb.from(table).delete().eq("family_id", familyId);
    if (result.error) throw result.error;
  }
  // Membership rows and wearer survive reset: existing signed sessions remain valid to seed again.
}

function p0Dataset(familyId: string) {
  const ids = demoContributorIds(familyId);
  const relatives = [
    { id: ids.maya, family_id: familyId, name: "Maya", relation_to_wearer: "granddaughter", color: "#E0A458" },
    { id: ids.david, family_id: familyId, name: "David", relation_to_wearer: "son", color: "#5B8DEF" },
    { id: ids.elena, family_id: familyId, name: "Elena", relation_to_wearer: "daughter", color: "#B07CC6" },
  ];
  function node(key: string, type: GraphNodeRow["type"], label: string, relation: string | null = null, aliases: string[] = []): GraphNodeRow {
    return { id: stableId(familyId, "demo-node", key), family_id: familyId, type, label, aliases, relation_to_wearer: relation };
  }
  const nodes = [node("rosa", "person", "Rosa", "self", ["Grandma", "Mom"]), node("nora", "person", "Nora", "sister"),
    node("cake", "tradition", "Sunday lemon cake baking", null, ["lemon cake"]), node("apron", "object", "yellow apron"),
    node("book", "object", "Nana's recipe book", null, ["recipe book"]), node("sam", "person", "Sam", "friend"),
    node("garden", "place", "community garden"), node("radio", "object", "blue radio")];
  const [rosa, nora, cake, apron, book, sam, garden, radio] = nodes;
  function edge(from: GraphNodeRow, rel: string, to: GraphNodeRow): GraphEdgeRow {
    return { id: stableId(familyId, from.id, rel, to.id), family_id: familyId, from_node: from.id, rel, to_node: to.id };
  }
  const edges = [edge(rosa, "participates_in", cake), edge(nora, "participates_in", cake), edge(nora, "sibling_of", rosa),
    edge(nora, "wears", apron), edge(rosa, "taught_by", nora), edge(rosa, "owns", book), edge(sam, "participates_in", garden), edge(sam, "owns", radio)];
  // Explicitly user-authorized demo reenactments, not claims of real recorded media.
  const stories: [keyof typeof ids, string, GraphNodeRow[], number[]][] = [
    ["maya", "This is Aunt Nora. Grandma and Nora used to bake lemon cake every Sunday. Nora always wore a yellow apron.", [rosa, nora, cake, apron], [0, 1, 3]],
    ["elena", "Nora is Rosa's sister. Nora taught Rosa how to cook when they were girls. Nora lived two streets away for forty years.", [nora, rosa], [2, 4]],
    ["david", "Rosa keeps Nana's recipe book on the kitchen shelf. I remember the blue ribbon tucked inside the recipe book.", [rosa, book], [5]],
    ["maya", "Nora likes to put fresh lemon zest into lemon cake. Nora and Rosa laughed together in the kitchen on Sundays.", [nora, rosa, cake], []],
    ["elena", "Nora wears the yellow apron when she bakes. Nora shares lemon cake with Rosa on Sundays.", [nora, apron, cake, rosa], []],
    ["david", "Nana's recipe book has a worn brown cover. Rosa keeps the recipe book dry and away from the sink.", [book, rosa], []],
    ["maya", "Sam grows tomatoes in the community garden. Sam carries a green watering can.", [sam, garden], [6]],
    ["elena", "Sam brings a blue radio to the community garden. Sam owns the blue radio.", [sam, radio, garden], [7]],
    ["david", "Sam repairs the blue radio on quiet afternoons.", [sam, radio], []],
    ["maya", "Rosa enjoys watching the birds outside the kitchen window.", [rosa], []],
    ["elena", "Rosa likes red tulips beside the front door.", [rosa], []],
    ["david", "Sam waters the community garden before breakfast.", [sam, garden], []],
  ];
  const memories = stories.map(([owner, transcript, subjects], i) => {
    const id = stableId(familyId, "demo-memory", String(i));
    return { id, family_id: familyId, contributor_id: ids[owner], kind: "story" as const, transcript,
      summary: transcript, media_path: null, caption: null, source_question_id: null,
      source: { type: "human" as const, reenacted: true, origin: "user-authorized P0 demo script", caption: "" },
      verified_facts: literalFacts(transcript, subjects, id, ids[owner]) };
  });
  const provenance = stories.flatMap(([, , subjects, edgeIndexes], i) => {
    const m = memories[i];
    return [
      ...subjects.map((n) => ({ id: stableId(m.id, "node", n.id), memory_id: m.id, contributor_id: m.contributor_id, node_id: n.id, edge_id: null as string | null })),
      ...edgeIndexes.map((j) => ({ id: stableId(m.id, "edge", edges[j].id), memory_id: m.id, contributor_id: m.contributor_id, node_id: null as string | null, edge_id: edges[j].id })),
    ];
  });
  return { relatives, nodes, edges, memories, provenance, ids };
}

/** Shared content and P0 evidence form one stable judging baseline. */
export function demoDataset(familyId: string) {
  const p0 = p0Dataset(familyId);
  if (familyId !== DEMO_FAMILY_ID) return p0;
  const normalize = (s: string) => s.toLowerCase().replaceAll("’", "'").replace(/^the /, "").replace(/ baking$/, "");
  const nodes: GraphNodeRow[] = baseline.graph_nodes.map(n => ({ ...n, type: n.type as GraphNodeRow["type"] }));
  const remap = new Map<string, string>();
  for (const node of p0.nodes) {
    const existing = nodes.find(n => n.type === node.type && normalize(n.label) === normalize(node.label));
    if (existing) remap.set(node.id, existing.id); else nodes.push(node);
  }
  const id = (value: string) => remap.get(value) ?? value;
  const edges: GraphEdgeRow[] = [...baseline.graph_edges];
  for (const edge of p0.edges) {
    const next = { ...edge, from_node: id(edge.from_node), to_node: id(edge.to_node) };
    const existing = edges.find(e => e.from_node === next.from_node && e.to_node === next.to_node && e.rel === next.rel);
    if (existing) remap.set(edge.id, existing.id); else edges.push(next);
  }
  const memories = baseline.memories.map(m => ({ ...m, kind: m.kind as "photo" | "story" | "answer", media_path: null,
    source: { type: "human" as const, reenacted: true, origin: "preserved shared HackMIT fictional demo", caption: m.caption ?? "" },
    verified_facts: m.transcript ? literalFacts(m.transcript, nodes, m.id, m.contributor_id) : [],
  }));
  for (const memory of p0.memories) memories.push({ ...memory, created_at: "2026-09-19T12:00:00Z",
    verified_facts: memory.verified_facts.map(f => ({ ...f, subjectNodeId: id(f.subjectNodeId) })),
  });
  const provenance = [...baseline.provenance, ...p0.provenance.map(p => ({ ...p,
    node_id: p.node_id ? id(p.node_id) : null, edge_id: p.edge_id ? id(p.edge_id) : null,
  }))];
  return { ...p0, relatives: baseline.relatives, nodes, edges, memories, provenance };
}

export async function seedDemo(sb: SupabaseClient, familyId: string) {
  if (familyId !== DEMO_FAMILY_ID) throw new Error("Seed requires the canonical shared demo family");
  const legacy = await sb.from("wearer").select("family_id").eq("family_id", "demo").maybeSingle();
  if (legacy.error) throw legacy.error;
  if (legacy.data) throw new Error("Apply migration 005 before seeding");
  const dataset = demoDataset(familyId);
  const existing = await sb.from("memories").select("id").eq("family_id", familyId);
  if (existing.error) throw existing.error;
  const present = new Set((existing.data ?? []).map(m => m.id));
  const hasEmbeddingKey = Boolean(process.env.OPENAI_API_KEY);
  const memories = [];
  // Seed is additive; reset is a separate explicit action. Preserve uploads and newer edits.
  for (const memory of dataset.memories.filter(m => !present.has(m.id))) memories.push({ ...memory,
    embedding: hasEmbeddingKey ? await embedText(memory.summary) : zeroVector(1536),
    source: { ...memory.source, embedding_status: hasEmbeddingKey ? "ready" : "missing_key" },
  });
  async function write<T extends object>(table: string, rows: T[]) {
    if (!rows.length) return;
    const result = await sb.from(table).upsert(rows, { ignoreDuplicates: true });
    if (result.error) throw result.error;
  }
  await write("wearer", [{ family_id: familyId, name: "Rosa" }]);
  await write("relatives", dataset.relatives);
  await write("graph_nodes", dataset.nodes);
  await write("graph_edges", dataset.edges);
  await write("memories", memories);
  await write("provenance", dataset.provenance);
  return { relatives: dataset.ids, nodes: Object.fromEntries(dataset.nodes.map((n) => [n.label, n.id])),
    memoryCount: dataset.memories.length, addedMemoryCount: memories.length, embeddingStatus: hasEmbeddingKey ? "ready" : "missing_key" };
}
