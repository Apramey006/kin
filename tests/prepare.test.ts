import { beforeEach, expect, it, vi } from "vitest";
import { demoDataset } from "../lib/seed";
import { DEMO_FAMILY_ID } from "../lib/demo";
import { buildBriefing, contributorName, relationshipText } from "../lib/briefing";
import type { MemoryRow } from "../lib/types";
const h = vi.hoisted(()=>({ sb: null as unknown }));
vi.mock("@/lib/supabase",()=>({ getServiceClient:()=>h.sb }));
import { GET } from "../app/api/prepare/route";
import { GET as previewGap } from "../app/api/weaver/preview/route";

const family = DEMO_FAMILY_ID;
const seeded = demoDataset(family);
const data = { ...seeded, memories: seeded.memories.map(m=>({created_at:"2026-09-20T00:00:00Z",...m})) };
const nora = data.nodes.find(n=>n.label==="Nora")!;
const build = (memories = data.memories as MemoryRow[], provenance = data.provenance, relatives = data.relatives) => buildBriefing(family,nora,memories,provenance,relatives);
it("derives a Nora briefing only from literal human evidence with named independent sources",()=>{
  const b=build(); expect(b.status).toBe("ready"); expect(b.context.person.relationship).toBe("Your sister");
  expect(b.context.supporters).toContain("Maya"); expect(b.context.supporters).toContain("Elena");
  for (const fact of b.context.facts) {
    const memory=data.memories.find(m=>m.id===fact.memoryId)!;
    expect(memory.transcript || memory.source.caption).toContain(fact.text);
    expect(data.provenance).toContainEqual(expect.objectContaining({memory_id:memory.id,node_id:nora.id,contributor_id:fact.contributorId}));
  }
});
it("does not count duplicate stories from one contributor as independent support",()=>{
  const only=data.memories.filter(m=>m.contributor_id===data.ids.maya);
  expect(build([...only,...only]).status).toBe("insufficient"); expect(build(only).context.facts).toEqual([]);
});
it("rejects foreign owners, foreign memories and missing or mismatched provenance",()=>{
  expect(build(data.memories.map(m=>({...m,family_id:"other"}))).status).toBe("insufficient");
  expect(build(undefined,[]).status).toBe("insufficient");
  expect(build(undefined,data.provenance.map(p=>({...p,contributor_id:"forged"}))).status).toBe("insufficient");
  expect(build(undefined,undefined,[]).status).toBe("insufficient");
});
it("never turns vision captions, generated summaries or altered text into a quote",()=>{
  const altered=data.memories.map(m=>({...m,transcript:"Different human words",source:{type:"human" as const,caption:""},caption:"Nora baked in Italy.",summary:"Nora baked in Italy."}));
  expect(build(altered).context.facts).toEqual([]);
  expect(build(data.memories.map(m=>({...m,source:undefined}))).status).toBe("insufficient");
});
it("withholds a disputed briefing without dropping the conflicting evidence",()=>{
  const memories=structuredClone(data.memories) as MemoryRow[];
  const m=memories.find(m=>m.verified_facts?.some(f=>f.subjectNodeId===nora.id))!;
  const f=m.verified_facts!.find(f=>f.subjectNodeId===nora.id)!;
  m.transcript="Nora never baked lemon cake."; f.text=m.transcript; f.sourceSpan={start:0,end:m.transcript.length};
  const b=build(memories); expect(b.status).toBe("disputed"); expect(b.context.facts).toEqual([]);
});
it("does not invent missing names or relationships and attributes self memories explicitly",()=>{
  expect(relationshipText(null)).toBeNull(); expect(relationshipText("self")).toBeNull();
  expect(contributorName("missing",data.relatives)).toBe("A family member");
  expect(contributorName("self",[{...data.relatives[0],id:"self",is_self:true}])).toBe("You");
});

let claims: Record<string, unknown>;
let reads: {table:string; filters:[string,unknown][]}[];
beforeEach(()=>{
  claims={kin_family_id:family,kin_contributor_id:data.ids.maya}; reads=[];
  const rows: Record<string,unknown[]>={graph_nodes:data.nodes,graph_edges:data.edges,memories:data.memories,relatives:data.relatives,provenance:data.provenance,weaver_questions:[],face_embeddings:[]};
  h.sb={auth:{getUser:async()=>({data:{user:{id:"user",app_metadata:claims}},error:null})},from:(table:string)=>{
    const filters:[string,unknown][]=[]; reads.push({table,filters});
    let ids:string[]|null=null;
    const result=()=>({data:(rows[table]??[]).filter(row=>filters.every(([k,v])=>(row as Record<string,unknown>)[k]===v)&&(!ids||ids.includes((row as {memory_id:string}).memory_id))),error:null});
    const q={select:()=>q,eq:(k:string,v:unknown)=>{filters.push([k,v]);return q;},in:(_k:string,v:string[])=>{ids=v;return q;},order:()=>q,range:()=>q,
      maybeSingle:async()=>({...result(),data:result().data[0]??null}),then:(resolve:(r:unknown)=>void)=>Promise.resolve(result()).then(resolve)};
    return q; // No insert/update/delete/rpc/storage exists: unexpected writes fail the test.
  }};
});
it("GET is authenticated, read-only, uncached, and scoped by verified membership",async()=>{
  const res=await GET(new Request("http://localhost/api/prepare?family_id=other",{headers:{authorization:"Bearer test"}}));
  expect(res.status).toBe(200); expect(res.headers.get("cache-control")).toBe("private, no-store");
  expect((await res.json()).briefings.find((b:{context:{person:{id:string}}})=>b.context.person.id===nora.id).status).toBe("ready");
  for(const read of reads.filter(r=>r.table!=="provenance")) expect(read.filters).toContainEqual(["family_id",family]);
});
it("denies missing authentication and forged persisted family membership",async()=>{
  expect((await GET(new Request("http://localhost/api/prepare"))).status).toBe(401); expect(reads).toEqual([]);
  claims.kin_family_id="other";
  expect((await GET(new Request("http://localhost/api/prepare",{headers:{authorization:"Bearer test"}}))).status).toBe(403);
});
it("cannot request a person outside the authenticated family",async()=>{
  const res=await GET(new Request("http://localhost/api/prepare?person=99999999-9999-4999-8999-999999999999",{headers:{authorization:"Bearer test"}}));
  expect(res.status).toBe(404);
});
it("previews the canonical Weaver gap for David without creating or phrasing a question with a provider",async()=>{
  const res=await previewGap(new Request("http://localhost/api/weaver/preview",{headers:{authorization:"Bearer test"}}));
  expect(res.status).toBe(200);
  expect((await res.json()).preview).toMatchObject({targetName:"David",state:"suggested"});
  // The fake client has no mutation or RPC methods; an accidental write fails.
});
