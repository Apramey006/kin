import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { CONFIG } from "@/lib/config";
import { getServiceClient, FAMILY_ID } from "@/lib/supabase";
import { captionImage, embedText } from "@/lib/providers/ai";
import { extractMemory, applyExtraction } from "@/lib/extract";
import type { GraphNodeRow } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface FaceLabel {
  person_node_id?: string;
  new_person?: { name: string; relation_to_wearer: string };
  box?: { x: number; y: number; width: number; height: number };
}

export async function POST(req: Request) {
  try {
    const sb = getServiceClient();
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const contributorId = form.get("contributor_id") as string;
    const userCaption = (form.get("caption") as string) ?? "";
    const labels: FaceLabel[] = JSON.parse(
      (form.get("labels") as string) ?? "[]"
    );
    if (!file || !contributorId) {
      return NextResponse.json({ error: "file and contributor_id required" }, { status: 400 });
    }
    if (file.size > CONFIG.maxUploadBytes) {
      return NextResponse.json({ error: "file too large" }, { status: 413 });
    }

    const { data: contributor } = await sb
      .from("relatives")
      .select("*")
      .eq("id", contributorId)
      .single();
    if (!contributor) {
      return NextResponse.json({ error: "unknown contributor" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const path = `${FAMILY_ID}/${crypto.randomUUID()}.jpg`;
    const { error: upErr } = await sb.storage
      .from("media")
      .upload(path, bytes, { contentType: file.type || "image/jpeg" });
    if (upErr) throw upErr;

    // Vision caption: descriptive only, never identifies people.
    const caption = await captionImage(bytes, file.type || "image/jpeg").catch(
      () => ({ caption: "a family photo", objects: [] as string[], setting: "" })
    );

    // Resolve labeled faces to person nodes.
    const { data: existingNodes } = await sb
      .from("graph_nodes")
      .select("*")
      .eq("family_id", FAMILY_ID);
    const nodes = (existingNodes ?? []) as GraphNodeRow[];
    const persons: { index: number; node_id: string }[] = [];
    const personNames: string[] = [];
    for (const [i, label] of labels.entries()) {
      let nodeId = label.person_node_id;
      if (!nodeId && label.new_person?.name) {
        const { data, error } = await sb
          .from("graph_nodes")
          .insert({
            family_id: FAMILY_ID,
            type: "person",
            label: label.new_person.name,
            relation_to_wearer: label.new_person.relation_to_wearer || null,
          })
          .select()
          .single();
        if (error) throw error;
        nodeId = data.id;
        nodes.push(data as GraphNodeRow);
      }
      if (nodeId) {
        persons.push({ index: i, node_id: nodeId });
        const n = nodes.find((x) => x.id === nodeId);
        personNames.push(n?.label ?? "someone");
      }
    }

    const { data: wearer } = await sb
      .from("wearer")
      .select("name")
      .eq("family_id", FAMILY_ID)
      .single();

    const names = personNames.length ? personNames.join(" and ") : "family";
    const summary =
      `${contributor.name} shared a photo of ${names}: ${caption.caption}` +
      (userCaption ? ` ${userCaption}` : "");

    const embedding = await embedText(summary).catch(() => new Array(1536).fill(0));
    const { data: memory, error: memErr } = await sb
      .from("memories")
      .insert({
        family_id: FAMILY_ID,
        contributor_id: contributorId,
        kind: "photo",
        media_path: path,
        caption: caption.caption,
        summary,
        embedding,
      })
      .select()
      .single();
    if (memErr) throw memErr;

    // Extraction adds object/place nodes and edges from the summary.
    let chips: { label: string; type: string; relation_to_wearer: string | null }[] = [];
    let appliedNodeIds: string[] = [];
    try {
      const extraction = await extractMemory({
        text: summary + (userCaption ? ` ${userCaption}` : ""),
        wearerName: wearer?.name ?? "the wearer",
        contributorName: contributor.name,
        contributorRelation: contributor.relation_to_wearer,
        existingNodes: nodes,
      });
      const applied = await applyExtraction(sb, {
        familyId: FAMILY_ID,
        contributorId,
        memoryId: memory.id,
        extraction,
        wearerName: wearer?.name ?? "the wearer",
      });
      chips = applied.chips;
      appliedNodeIds = applied.nodeIds;
    } catch {
      // extraction failure is non-fatal for photo ingestion
    }

    // Labeled people get provenance on this memory, unless extraction already wrote it.
    const unprovenanced = persons.filter((p) => !appliedNodeIds.includes(p.node_id));
    if (unprovenanced.length) {
      await sb.from("provenance").insert(
        unprovenanced.map((p) => ({
          memory_id: memory.id,
          contributor_id: contributorId,
          node_id: p.node_id,
        }))
      );
    }

    return NextResponse.json({
      memory_id: memory.id,
      media_path: path,
      caption: caption.caption,
      summary,
      entities: chips,
      persons,
    });
  } catch (e) {
    return jsonError(e, "photo ingestion failed");
  }
}
