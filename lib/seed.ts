import type { SupabaseClient } from "@supabase/supabase-js";
import { embedText } from "./providers/ai";
import { CONFIG } from "./config";
import { zeroVector } from "./util";

/** Wipe every table for the demo family and empty its storage prefix. */
export async function resetFamily(sb: SupabaseClient, familyId: string) {
  for (const table of ["weaver_questions", "recall_events", "face_embeddings", "memories", "graph_nodes", "relatives", "wearer"]) {
    const { error } = await sb.from(table).delete().eq("family_id", familyId);
    if (error) throw new Error(`Could not reset ${table}: ${error.message}`);
  }
  try {
    const { data: files } = await sb.storage
      .from(CONFIG.storageBucket)
      .list(familyId);
    if (files?.length) {
      await sb.storage
        .from(CONFIG.storageBucket)
        .remove(files.map((f) => `${familyId}/${f.name}`));
    }
  } catch {
    // storage bucket may not exist yet; ignore
  }
}

async function embed(summary: string): Promise<number[]> {
  try {
    return await embedText(summary);
  } catch {
    return zeroVector(1536);
  }
}

/**
 * Deterministic demo seed. Text memories only; photos and faces are added
 * live during the demo because face matching needs real faces.
 */
export async function seedDemo(sb: SupabaseClient, familyId: string) {
  await resetFamily(sb, familyId);

  const wearerInsert = await sb.from("wearer").insert({ family_id: familyId, name: "Rosa" });
  if (wearerInsert.error) throw new Error(wearerInsert.error.message);

  const { data: rels, error: relsError } = await sb
    .from("relatives")
    .insert([
      { family_id: familyId, name: "Maya", relation_to_wearer: "granddaughter", color: "#E0A458" },
      { family_id: familyId, name: "David", relation_to_wearer: "son", color: "#5B8DEF" },
      { family_id: familyId, name: "Elena", relation_to_wearer: "daughter", color: "#B07CC6" },
    ])
    .select();
  if (relsError) throw new Error(relsError.message);
  const [maya, david, elena] = rels!;

  const { data: nodeRows, error: nodeRowsError } = await sb
    .from("graph_nodes")
    .insert([
      { family_id: familyId, type: "person", label: "Rosa", relation_to_wearer: "self" },
      { family_id: familyId, type: "person", label: "Nora", relation_to_wearer: "sister" },
      { family_id: familyId, type: "tradition", label: "Sunday lemon cake baking" },
      { family_id: familyId, type: "object", label: "yellow apron" },
      { family_id: familyId, type: "object", label: "Nana's recipe book" },
    ])
    .select();
  if (nodeRowsError) throw new Error(nodeRowsError.message);
  const byLabel = Object.fromEntries(nodeRows!.map((n) => [n.label, n.id]));
  const rosa = byLabel["Rosa"];
  const nora = byLabel["Nora"];
  const cake = byLabel["Sunday lemon cake baking"];
  const apron = byLabel["yellow apron"];
  const book = byLabel["Nana's recipe book"];

  const { data: edgeRows, error: edgeRowsError } = await sb
    .from("graph_edges")
    .insert([
      { family_id: familyId, from_node: rosa, rel: "participates_in", to_node: cake },
      { family_id: familyId, from_node: nora, rel: "participates_in", to_node: cake },
      { family_id: familyId, from_node: nora, rel: "sibling_of", to_node: rosa },
      { family_id: familyId, from_node: nora, rel: "wears", to_node: apron },
      { family_id: familyId, from_node: rosa, rel: "taught_by", to_node: nora },
      { family_id: familyId, from_node: rosa, rel: "owns", to_node: book },
    ])
    .select();
  if (edgeRowsError) throw new Error(edgeRowsError.message);
  const edgeId = (from: string, rel: string, to: string) =>
    edgeRows!.find((e) => e.from_node === from && e.rel === rel && e.to_node === to)!.id;

  const mayaTranscript =
    "This is Aunt Nora. Grandma and Nora used to bake lemon cake every Sunday. Nora always wore that ridiculous yellow apron.";
  const mayaSummary =
    "Maya shared a story: Grandma Rosa and Nora used to bake lemon cake every Sunday, and Nora always wore a yellow apron.";
  const elenaTranscript =
    "Nora taught Mom how to cook when they were girls. Nora lived two streets away for forty years.";
  const elenaSummary =
    "Elena shared a story: Nora taught Rosa how to cook when they were girls, and Nora lived two streets away for forty years.";
  const davidSummary =
    "David shared a photo of Nana's recipe book on the kitchen shelf.";

  const { data: memRows, error: memRowsError } = await sb
    .from("memories")
    .insert([
      {
        family_id: familyId,
        contributor_id: maya.id,
        kind: "story",
        transcript: mayaTranscript,
        summary: mayaSummary,
        embedding: await embed(mayaSummary),
      },
      {
        family_id: familyId,
        contributor_id: elena.id,
        kind: "story",
        transcript: elenaTranscript,
        summary: elenaSummary,
        embedding: await embed(elenaSummary),
      },
      {
        family_id: familyId,
        contributor_id: david.id,
        kind: "photo",
        caption: "A recipe book on a kitchen shelf",
        summary: davidSummary,
        embedding: await embed(davidSummary),
      },
    ])
    .select();
  if (memRowsError) throw new Error(memRowsError.message);
  const [mayaMem, elenaMem, davidMem] = memRows!;

  const provenanceInsert = await sb.from("provenance").insert([
    // Maya's story -> Rosa, Nora, cake, apron + their edges
    { memory_id: mayaMem.id, contributor_id: maya.id, node_id: rosa },
    { memory_id: mayaMem.id, contributor_id: maya.id, node_id: nora },
    { memory_id: mayaMem.id, contributor_id: maya.id, node_id: cake },
    { memory_id: mayaMem.id, contributor_id: maya.id, node_id: apron },
    { memory_id: mayaMem.id, contributor_id: maya.id, edge_id: edgeId(rosa, "participates_in", cake) },
    { memory_id: mayaMem.id, contributor_id: maya.id, edge_id: edgeId(nora, "participates_in", cake) },
    { memory_id: mayaMem.id, contributor_id: maya.id, edge_id: edgeId(nora, "sibling_of", rosa) },
    { memory_id: mayaMem.id, contributor_id: maya.id, edge_id: edgeId(nora, "wears", apron) },
    // Elena's story -> Nora, Rosa + taught_by edge
    { memory_id: elenaMem.id, contributor_id: elena.id, node_id: nora },
    { memory_id: elenaMem.id, contributor_id: elena.id, node_id: rosa },
    { memory_id: elenaMem.id, contributor_id: elena.id, edge_id: edgeId(rosa, "taught_by", nora) },
    // David's photo -> book + Rosa owns book
    { memory_id: davidMem.id, contributor_id: david.id, node_id: book },
    { memory_id: davidMem.id, contributor_id: david.id, node_id: rosa },
    { memory_id: davidMem.id, contributor_id: david.id, edge_id: edgeId(rosa, "owns", book) },
  ]);

  if (provenanceInsert.error) throw new Error(provenanceInsert.error.message);

  return {
    relatives: { maya: maya.id, david: david.id, elena: elena.id },
    nodes: byLabel,
  };
}
