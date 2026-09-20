/** Opt-in check: uses real provider credits and temporary Supabase records.
 * Uses generated speech, not a microphone. Does not test faces or device playback.
 * Start the app first. Run: KIN_BASE_URL=http://localhost:3100 npx tsx scripts/check-live-memory.ts
 */
import { loadEnvConfig } from "@next/env";
import assert from "node:assert/strict";

loadEnvConfig(process.cwd());
const familyId = `kin-live-check-${crypto.randomUUID()}`;
// This override is process-local, before importing the routes/config.
process.env.NEXT_PUBLIC_KIN_FAMILY_ID = familyId;

async function main() {
  const { getServiceClient, FAMILY_ID } = await import("../lib/supabase");
  assert.equal(FAMILY_ID, familyId);
  const { seedDemo, resetFamily } = await import("../lib/seed");
  const { synthesizeSpeech } = await import("../lib/providers/elevenlabs");
  const { createServerClient } = await import("@supabase/ssr");
  const baseUrl = process.env.KIN_BASE_URL || "http://localhost:3100";
  const sessions = new Map<string,string>();
  const userIds: string[] = [];
  let ownerCookie = "";
  const post = (path:string, req:Request) => fetch(baseUrl+path,{method:"POST",headers:req.headers,body:req.body,duplex:"half"} as RequestInit);
  const story = (req:Request) => post("/api/memories/story",req);
  const answer = (req:Request) => post("/api/weaver/answer",req);
  const weaver = () => fetch(baseUrl+"/api/weaver/run",{method:"POST",headers:{Cookie:ownerCookie}});
  const { deleteMemory } = await import("../lib/delete-memory");
  const { extractMemory } = await import("../lib/extract");
  const sb = getServiceClient();
  const request = (fields: Record<string, string>, audio: Buffer) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    form.set("file", new File([new Uint8Array(audio)], "fictional-speech.mp3", { type: "audio/mpeg" }));
    return new Request(baseUrl+"/api", { method: "POST", body: form, headers:{Cookie:sessions.get(fields.contributor_id)||""} });
  };
  const responseBody = async (response: Response) => {
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return body;
  };
  const started = Date.now();
  console.log("Temporary family:", familyId);
  try {
    const seeded = await seedDemo(sb, familyId);
    for(const relativeId of Object.values(seeded.relatives)) {
      const email=`kin-service-${crypto.randomUUID()}@example.invalid`,password=crypto.randomUUID()+"aA1!";
      const account=await sb.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(account.error);userIds.push(account.data.user!.id);
      if(userIds.length===1){const family=await sb.from("families").insert({id:familyId,owner_id:account.data.user!.id});assert.ifError(family.error);}
      const membership=await sb.from("family_members").insert({user_id:account.data.user!.id,family_id:familyId,relative_id:relativeId});assert.ifError(membership.error);
      const jar=new Map<string,string>();const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(c=>jar.set(c.name,c.value))}});
      const login=await auth.auth.signInWithPassword({email,password});assert.ifError(login.error);
      const cookie=[...jar].map(([name,value])=>`${name}=${value}`).join("; ");sessions.set(relativeId,cookie);if(!ownerCookie)ownerCookie=cookie;
    }
    for (const [contributor, text] of [
      [seeded.relatives.maya, "Nora and Rosa baked lemon cake every Sunday. Nora always wore a yellow apron."],
      [seeded.relatives.elena, "Nora taught Rosa to cook. They baked lemon cake together on Sundays."],
    ]) {
      const audio = await synthesizeSpeech(text);
      const t = Date.now();
      const saved = await responseBody(await story(request({ contributor_id: contributor }, audio)));
      assert.match(saved.transcript, /Nora/i);
      const stored = await sb.from("memories").select("media_path").eq("id", saved.memory_id).single();
      assert.ifError(stored.error);
      const file = await sb.storage.from("media").download(stored.data!.media_path);
      assert.ifError(file.error);
      assert.equal(file.data!.size, audio.length);
      console.log("Story saved:", JSON.stringify({ transcript: saved.transcript, elapsedMs: Date.now() - t, bytes: audio.length }));
    }
    const question = (await responseBody(await weaver())).question;
    if (question?.gap_type !== "missing_origin") {
      const graph = await sb.from("graph_nodes").select("id,label").eq("family_id", familyId);
      const links = await sb.from("graph_edges").select("from_node,rel,to_node").eq("family_id", familyId);
      console.log("Unexpected gap graph:", JSON.stringify(links.data?.map((e) => ({ from: graph.data?.find((n) => n.id === e.from_node)?.label,
        rel: e.rel, to: graph.data?.find((n) => n.id === e.to_node)?.label }))));
    }
    assert.ok(question, "Expected a missing-origin question");
    assert.equal(question.gap_type, "missing_origin");
    assert.equal(question.target_relative_id, seeded.relatives.david);
    console.log("Weaver question:", question.question_text);
    const audio = await synthesizeSpeech("The Sunday lemon cake recipe came from their mother in Italy.");
    const t = Date.now();
    const saved = await responseBody(await answer(request({ contributor_id: seeded.relatives.david, question_id: question.id }, audio)));
    assert.match(saved.transcript, /Italy/i);
    const [edges, nodes, provenance, answered] = await Promise.all([
      sb.from("graph_edges").select("*").eq("family_id", familyId),
      sb.from("graph_nodes").select("*").eq("family_id", familyId),
      sb.from("provenance").select("node_id, edge_id").eq("memory_id", saved.memory_id),
      sb.from("weaver_questions").select("status, answer_memory_id").eq("id", question.id).single(),
    ]);
    for (const result of [edges, nodes, provenance, answered]) assert.ifError(result.error);
    assert.equal(answered.data!.status, "answered");
    assert.equal(answered.data!.answer_memory_id, saved.memory_id);
    assert.ok(provenance.data!.some((p) => p.node_id === seeded.nodes["Sunday lemon cake baking"]));
    const origins = edges.data!.filter((e) => e.from_node === seeded.nodes["Sunday lemon cake baking"] && ["origin", "started_by", "taught_by"].includes(e.rel));
    console.log("Answer graph:", JSON.stringify(edges.data!.filter((e) => provenance.data!.some((p) => p.edge_id === e.id)).map((e) => ({
      from: nodes.data!.find((n) => n.id === e.from_node)?.label, rel: e.rel, to: nodes.data!.find((n) => n.id === e.to_node)?.label,
    }))));
    assert.ok(origins.length, "Answer must add an origin connection to the tradition");
    assert.ok(nodes.data!.some((n) => /Italy/i.test(n.label)), "Answer must add Italy");
    console.log("Answer saved:", JSON.stringify({ transcript: saved.transcript, elapsedMs: Date.now() - t, originEdges: origins.length }));
    const uncertain = await extractMemory({ text: "I don't know where it came from.",
      wearerName: "Rosa", contributorName: "David", contributorRelation: "son",
      existingNodes: nodes.data!, questionContext: question.question_text,
      questionTarget: { nodeId: question.gap_node_id, gapType: question.gap_type } });
    assert.ok(!uncertain.edges.some((e) => ["origin", "started_by"].includes(e.rel)), "An uncertain answer must not fabricate an origin");
    console.log("Uncertain answer adds no origin claim.");
    const memory = await sb.from("memories").select("media_path").eq("id", saved.memory_id).single();
    assert.ifError(memory.error);
    assert.equal(await deleteMemory(sb, familyId, seeded.relatives.david, saved.memory_id), true);
    const removedFile = await sb.storage.from("media").download(memory.data!.media_path);
    assert.ok(removedFile.error, "Deleted answer audio must be unavailable");
    const removedMemory = await sb.from("memories").select("id").eq("id", saved.memory_id);
    assert.ifError(removedMemory.error);
    assert.equal(removedMemory.data!.length, 0);
    console.log("Live answer deletion removed its database record and stored audio.");
    console.log("PASS real memory/Weaver services:", Date.now() - started, "ms. Camera, microphone capture, replay, and audible playback remain untested here.");
  } finally {
    // Restrict every cleanup operation to this newly generated temporary family.
    const files = await sb.storage.from("media").list(familyId, { limit: 1000 });
    assert.ifError(files.error);
    if (files.data?.length) {
      const removed = await sb.storage.from("media").remove(files.data.map((f) => `${familyId}/${f.name}`));
      assert.ifError(removed.error);
    }
    await resetFamily(sb, familyId);
    const familyRemoval=await sb.from("families").delete().eq("id",familyId);assert.ifError(familyRemoval.error);
    for(const id of userIds){const removed=await sb.auth.admin.deleteUser(id);assert.ifError(removed.error);}
    console.log("Temporary family, accounts, and media cleaned up.");
  }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Live check failed"); process.exitCode = 1; });
