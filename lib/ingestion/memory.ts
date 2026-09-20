import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase";
import { transcribeAudio } from "@/lib/providers/deepgram";
import { captionImage, embedText } from "@/lib/providers/openai";
import { extractMemory, type Extraction } from "@/lib/extract";
import type { GraphEdgeRow, GraphNodeRow, MemoryKind } from "@/lib/types";
import { authenticateIngestion, assertOwnership } from "./auth";
import { idSchema, ingestionError, IngestionError, multipart, upload } from "./http";
import { digest, stableId } from "./ids";
import { commitIngestion, existingReceipt, prepareGraph } from "./persist";
import { literalFacts } from "./facts";
import { anchorOriginAnswer } from "./answer";

const labelsSchema = z.array(z.object({
  person_node_id: idSchema.optional(),
  new_person: z.object({ name: z.string().trim().min(1).max(120), relation_to_wearer: z.string().trim().max(120) }).strict().optional(),
  box: z.object({ x: z.number().finite().nonnegative(), y: z.number().finite().nonnegative(),
    width: z.number().finite().positive(), height: z.number().finite().positive() }).optional(),
}).strict().refine((label) => Boolean(label.person_node_id) !== Boolean(label.new_person))).max(32);

export async function ingestMemory(req: Request, kind: MemoryKind) {
  try {
    const sb = getServiceClient();
    const identity = await authenticateIngestion(req, sb);
    const form = await multipart(req);
    assertOwnership(identity, form.get("contributor_id"), form.get("family_id"));
    const media = await upload(form, kind === "photo" ? "image" : "audio");
    const questionId = kind === "answer" ? idSchema.parse(form.get("question_id")) : null;
    const caption = z.string().trim().max(4000).parse(form.get("caption") ?? "");
    const labels = kind === "photo" ? labelsSchema.parse(JSON.parse(z.string().parse(form.get("labels") ?? "[]"))) : [];
    const consent = form.get("consent") === "true";
    if (labels.length && !consent) throw new IngestionError(400, "Explicit consent is required to label people");
    const key = z.string().min(1).max(200).optional().parse(req.headers.get("idempotency-key") ?? undefined);
    const requestHash = digest(JSON.stringify({ kind, media: digest(media.bytes), mime: media.mime, caption, labels, consent, questionId }));
    const memoryId = stableId(identity.familyId, kind === "answer" ? "answer" : identity.contributorId, kind, questionId ?? key ?? requestHash);
    const prior = await existingReceipt(sb, identity, memoryId, requestHash);
    if (prior) return NextResponse.json(prior);

    let questionContext: string | undefined;
    let answerQuestion: { gap_node_id?: string; gap_type?: string } = {};
    if (questionId) {
      const { data: question, error } = await sb.from("weaver_questions").select("*")
        .eq("id", questionId).eq("family_id", identity.familyId).maybeSingle();
      if (error) throw error;
      if (!question) throw new IngestionError(404, "Question not found");
      if (question.target_relative_id !== identity.contributorId) throw new IngestionError(403, "Question belongs to another contributor");
      if (question.status !== "open") throw new IngestionError(409, "Question already answered");
      questionContext = question.question_text;
      answerQuestion = question;
    }
    const [wearerResult, nodesResult, edgesResult] = await Promise.all([
      sb.from("wearer").select("name").eq("family_id", identity.familyId).maybeSingle(),
      sb.from("graph_nodes").select("*").eq("family_id", identity.familyId),
      sb.from("graph_edges").select("*").eq("family_id", identity.familyId),
    ]);
    if (wearerResult.error) throw wearerResult.error;
    if (nodesResult.error) throw nodesResult.error;
    if (edgesResult.error) throw edgesResult.error;
    const nodes = (nodesResult.data ?? []) as GraphNodeRow[];
    for (const label of labels) {
      if (label.person_node_id && !nodes.some((node) => node.id === label.person_node_id && node.type === "person")) {
        throw new IngestionError(403, "Labeled person is not in this family");
      }
    }

    let transcript: string | null = null;
    let visionCaption: string | null = null;
    const labelNodes = labels.map((label, index) => {
      const known = nodes.find((node) => node.id === label.person_node_id);
      return { ref: known ? `existing:${known.id}` : `new:label-${index}`, type: "person" as const,
        label: known?.label ?? label.new_person!.name,
        relation_to_wearer: known?.relation_to_wearer ?? label.new_person?.relation_to_wearer ?? null };
    });
    if (kind === "photo") {
      visionCaption = (await captionImage(media.bytes, media.mime)).caption;
    } else {
      transcript = await transcribeAudio(media.bytes, media.mime);
      if (!transcript.trim()) throw new IngestionError(422, "No speech detected");
    }
    const source = kind === "photo"
      ? JSON.stringify({ contributor_caption: caption, explicitly_labeled_people: labelNodes.map((node) => ({ name: node.label, relation_to_wearer: node.relation_to_wearer })) })
      : transcript!;
    const extraction: Extraction = await extractMemory({ text: source, questionContext, isSelf: identity.isSelf,
      wearerName: wearerResult.data?.name ?? "the wearer", contributorName: identity.contributor.name,
      contributorRelation: identity.contributor.relation_to_wearer, existingNodes: nodes });
    for (const label of labelNodes) {
      if (!extraction.nodes.some((node) => node.ref === label.ref)) extraction.nodes.push(label);
    }
    const answerSubjects = kind === "answer" ? anchorOriginAnswer(extraction, transcript!, answerQuestion,
      nodes, (edgesResult.data ?? []) as GraphEdgeRow[]) : [];
    const graph = prepareGraph(identity, memoryId, extraction, nodes, (edgesResult.data ?? []) as GraphEdgeRow[]);
    const humanText = kind === "photo" ? caption : transcript!;
    const verifiedFacts = literalFacts(humanText, [...nodes, ...graph.nodes].filter((n) =>
      [...graph.refs.values()].includes(n.id)), memoryId, identity.contributorId);
    for (const subject of answerSubjects) {
      verifiedFacts.push({ id: stableId(memoryId, subject.id, transcript!), subjectNodeId: subject.id,
        text: transcript!, sourceSpan: { start: 0, end: transcript!.length }, memoryId, contributorId: identity.contributorId });
    }
    const humanSource = { type: "human", user_id: identity.userId, caption, labels, consent,
      question_context: questionContext ?? null, gap_node_id: answerQuestion.gap_node_id ?? null };
    const embeddingResult = z.array(z.number().finite()).length(1536).safeParse(await embedText(extraction.summary));
    if (!embeddingResult.success) throw new IngestionError(502, "Invalid embedding");
    const embedding = embeddingResult.data;
    if (!embedding.some((value) => value !== 0)) throw new IngestionError(502, "Empty embedding");
    const path = `${identity.familyId}/${identity.contributorId}/${memoryId}/${digest(media.bytes)}`;
    const stored = await sb.storage.from("media").upload(path, media.bytes, { contentType: media.mime, upsert: false });
    if (stored.error && String(stored.error.statusCode) !== "409") throw stored.error;
    const persons = labelNodes.map((node, index) => ({ index, node_id: graph.refs.get(node.ref)! }));
    const response = { memory_id: memoryId, media_path: path, transcript, caption: visionCaption,
      summary: extraction.summary, entities: graph.chips, persons };
    const payload = {
      id: memoryId, request_hash: requestHash, family_id: identity.familyId, contributor_id: identity.contributorId,
      memory: { id: memoryId, family_id: identity.familyId, contributor_id: identity.contributorId, kind,
        media_path: path, transcript, caption: visionCaption, summary: extraction.summary, embedding, source_question_id: questionId,
        source: humanSource, verified_facts: verifiedFacts },
      nodes: graph.nodes, edges: graph.edges, provenance: graph.provenance, response,
      source: humanSource,
    };
    // Window closed: hold the prepared payload for family review rather than
    // committing it. The wearer's experience is unchanged; only what the system
    // does with the recording differs. Nothing enters the graph until approved,
    // so no reader anywhere has to filter unreviewed rows.
    if (identity.isSelf && identity.contributor.self_capture_open === false) {
      const held = await sb.from("pending_contributions").upsert({
        id: memoryId, family_id: identity.familyId, contributor_id: identity.contributorId,
        kind, preview: humanText.trim().slice(0, 2000), media_path: path, payload, state: "pending",
      }, { onConflict: "id" }).select("id").single();
      if (held.error) throw held.error;
      return NextResponse.json({ ...response, pending_review: true });
    }
    const result = await commitIngestion(sb, payload);
    return NextResponse.json(result);
  } catch (error) {
    return ingestionError(error);
  }
}
