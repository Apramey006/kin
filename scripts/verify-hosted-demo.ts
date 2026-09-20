import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { DEMO_ACCOUNTS, DEMO_FAMILY_ID } from '../lib/demo';
loadEnvConfig(process.cwd());
let stage = 'configuration';
async function main() {
  const { demoDataset, seedDemo } = await import('../lib/seed');
  const { authenticateFamily, authenticateIngestion, authenticateAdmin } = await import('../lib/ingestion/auth');
  const { pickTopGap, routeQuestion } = await import('../lib/weaver');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const password = process.env.KIN_DEMO_PASSWORD ?? readFileSync('.env.demo.local','utf8').match(/^KIN_DEMO_PASSWORD=(.+)$/m)?.[1]?.trim().replace(/^(["'])(.*)\1$/, '$2');
  assert.ok(password);
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(url,key,options);
  const expected = demoDataset(DEMO_FAMILY_ID);
  const expectedTables = { relatives: expected.relatives, memories: expected.memories, graph_nodes: expected.nodes, graph_edges: expected.edges, provenance: expected.provenance };
  stage = 'canonical content';
  for (const [table, rows] of Object.entries(expectedTables)) {
    const result = await service.from(table).select('*');
    assert.equal(result.error,null);
    assert.deepEqual(result.data!.map(r=>r.id).sort(),rows.map(r=>r.id).sort());
    if (table !== 'provenance') assert.ok(result.data!.every(r=>r.family_id===DEMO_FAMILY_ID));
    if (table === 'memories') for (const memory of expected.memories) {
      const actual: Record<string, unknown> = result.data!.find(r=>r.id===memory.id)!;
      for (const field of ['transcript','summary','caption','contributor_id','kind'] as const) assert.equal(actual[field],memory[field]);
      assert.deepEqual(actual.verified_facts,memory.verified_facts);
      assert.equal((actual.source as { embedding_status: string }).embedding_status,'ready');
    }
    console.log(table+': canonical content verified ('+rows.length+')');
  }
  stage = 'repeat seed';
  const seeded = await seedDemo(service,DEMO_FAMILY_ID);
  assert.equal(seeded.addedMemoryCount,0);
  console.log('Repeated seed: zero additional memories');
  stage = 'accounts';
  const users=await service.auth.admin.listUsers({perPage:100});
  assert.equal(users.error,null);assert.equal(users.data.users.length,4);
  assert.deepEqual(users.data.users.map(u=>u.email).sort(),DEMO_ACCOUNTS.map(a=>a.email).sort());
  for (const account of DEMO_ACCOUNTS) {
    stage = account.name+' authorization';
    const client=createClient(url,publicKey,options);
    const login=await client.auth.signInWithPassword({email:account.email,password});
    assert.equal(login.error,null);
    const req=new Request('http://localhost/verification',{headers:{authorization:'Bearer '+login.data.session!.access_token}});
    const identity=await authenticateFamily(req,service);
    assert.equal(identity.familyId,DEMO_FAMILY_ID);
    assert.equal(identity.contributorId,account.contributorId);
    if(account.role==='organizer') assert.equal((await authenticateAdmin(req,service)).isAdmin,true);
    else await assert.rejects(()=>authenticateAdmin(req,service),(e:unknown)=>(e as {status:number}).status===403);
    if(account.role==='wearer') await assert.rejects(()=>authenticateIngestion(req,service),(e:unknown)=>(e as {status:number}).status===403);
    for(const [table,rows] of Object.entries(expectedTables)) {
      const visible=await client.from(table).select('id');assert.equal(visible.error,null);assert.equal(visible.data!.length,rows.length);
      if(table!=='provenance') {const foreign=await client.from(table).select('id').neq('family_id',DEMO_FAMILY_ID);assert.equal(foreign.error,null);assert.equal(foreign.data!.length,0);}
    }
    for(const table of ['face_embeddings','ingestion_receipts']) {const restricted=await client.from(table).select('id');assert.equal(restricted.error?.code,'42501');}
    const rpc=await client.rpc('match_subject_memories',{query:Array(1536).fill(0),family:DEMO_FAMILY_ID,contributor:DEMO_ACCOUNTS[0].contributorId,subject:expected.nodes[0].id,k:1});
    assert.equal(rpc.error?.code,'42501');
    await client.auth.signOut();
    console.log(account.name+': sign-in, family reads, role boundaries and privileged-access denial verified');
  }
  stage='anonymous access';
  const anon=createClient(url,publicKey,options);
  for(const table of Object.keys(expectedTables)) {const result=await anon.from(table).select('id');assert.ok(result.error?.code==='42501'||(!result.error&&result.data?.length===0));}
  console.log('Anonymous family data: inaccessible');
  const graph={...expected,facePersonIds:[],openQuestionRelativeIds:[],wearerNodeId:expected.nodes.find(n=>n.relation_to_wearer==='self')!.id};
  const gap=pickTopGap(graph)!;assert.equal(gap.type,'missing_origin');assert.equal(routeQuestion(graph,gap),DEMO_ACCOUNTS[1].contributorId);
  console.log('Canonical Nora/lemon-cake gap routes to David');
}
main().catch(()=>{console.error(JSON.stringify({verification:'FAILED',stage}));process.exitCode=1;});
