import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { buildLegacyUpgrade } from '../../scripts/build-legacy-upgrade.mjs';
const db = await PGlite.create({extensions:{vector}});
const read = name => readFile(new URL(name,import.meta.url),'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scalar = async (sql,args=[]) => (await db.query(sql,args)).rows[0].value;
const upgrade = await read('../../supabase/upgrades/pull_apart_to_main.sql');
assert.equal(upgrade,await buildLegacyUpgrade(),'Regenerate the recovery SQL after editing its source migrations.');
try {
 await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage; create schema extensions;
 create table auth.users(id uuid primary key, raw_app_meta_data jsonb default '{}'::jsonb);
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
 create table storage.buckets(id text primary key,name text,public boolean);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
 create publication supabase_realtime;
 `);
 await db.exec(await read('./fixtures/pull-apart-schema.sql'));
 await db.query('insert into auth.users(id) values($1),($2),($3)',[id(1),id(2),id(3)]);
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id(1)})]);
 const family = await scalar("select create_kin_family('Rosa','Maya','granddaughter') as value");
 const relative = await scalar('select relative_id as value from family_members where user_id=$1',[id(1)]);
 await db.query("insert into family_invites(token,family_id,role) values($1,$2,'loved_one')",[id(4),family]);
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id(2)})]);
 await scalar('select join_kin_family($1,null,null) as value',[id(4)]);
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id(3)})]);
 await scalar("select create_kin_family('Ada','Lee','child') as value");
 await db.query("insert into memories(id,family_id,contributor_id,kind,summary,transcript,media_path,embedding) values($1,$2,$3,'story','A family story','Our original words.','private/old.wav',$4::vector)",[id(5),family,relative,JSON.stringify(Array(1536).fill(.01))]);
 await db.query("insert into storage.objects(bucket_id,name) values('media','private/old.wav')");
 await db.query("insert into memories(id,family_id,contributor_id,kind,summary,caption,media_path,embedding) values($1,$2,$3,'photo','A family photo','Our original caption.','private/old.jpg',$4::vector)",[id(7),family,relative,JSON.stringify(Array(1536).fill(.01))]);
 await db.query("insert into face_embeddings(id,family_id,person_node_id,contributor_id,memory_id,descriptor) select $1,$2,n.id,$3,$4,$5::vector from graph_nodes n where n.family_id=$2 and n.relation_to_wearer='self'",[id(6),family,relative,id(7),JSON.stringify(Array(128).fill(.01))]);
 const original = {};
 for(const table of ['family_members','families','family_invites','memories','storage.objects','face_embeddings','graph_nodes','provenance']) original[table]=(await db.query(`select to_jsonb(t) as row from ${table} t`)).rows.map(x=>x.row);
 // Reproduce the reported sequence: original branch schema + 009 + failed 010.
 await db.exec(await read('../../supabase/migrations/009_family_accounts.sql'));
 async function await010(){return await read('../../supabase/migrations/010_loved_one_invites.sql')}
 // Check the actual SQL, keeping rollback explicit after the intentional failure.
 try { await db.exec(await await010()); assert.fail('010 should require main prerequisites'); }
 catch(error){assert.ok(['42P01','P0001'].includes(error.code),error.message);await db.exec('rollback');}
 await db.exec(upgrade);
 for(const [table,rows] of Object.entries(original)) {
  const after=(await db.query(`select to_jsonb(t) as row from ${table} t`)).rows.map(x=>x.row);
  assert.equal(after.length,rows.length,`${table} count unchanged`);
  for(const before of rows){const row=after.find(x=>(x.id??x.user_id??x.token)===(before.id??before.user_id??before.token));for(const [k,v] of Object.entries(before))assert.deepEqual(row[k],v,`${table}.${k} unchanged`);}
 }
 assert.equal(await scalar('select count(*)::int as value from wearer_accounts where user_id=$1',[id(2)]),1);
 assert.equal(await scalar('select self_capture_open as value from relatives where family_id=$1 and is_self',[family]),false);
 assert.equal(await scalar("select raw_app_meta_data->>'kin_role' as value from auth.users where id=$1",[id(2)]),'wearer');
 assert.equal(await scalar("select raw_app_meta_data->>'kin_admin' as value from auth.users where id=$1",[id(1)]),'true');
 assert.equal(await scalar('select source as value from memories where id=$1',[id(5)]),null);
 assert.deepEqual(await scalar('select verified_facts as value from memories where id=$1',[id(5)]),[]);
 for(const table of ['ingestion_receipts','pending_contributions']) await db.query(`select * from ${table} limit 0`);
 await db.query('select source,verified_facts,audio_segments from memories limit 0');
 await db.query('select face_outcome,evidence,reason_code,selected_fact_ids from recall_events limit 0');
 assert.equal(await scalar('select model as value from face_embeddings where id=$1',[id(6)]),null);
 await db.exec('set role authenticated');
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id(1)})]);
 assert.equal(await scalar('select count(*)::int as value from memories'),2);
 await assert.rejects(()=>db.query('select * from face_embeddings'),e=>e.code==='42501');
 assert.equal(await scalar("select has_function_privilege('authenticated','public.match_keeper_faces(vector,text,uuid,integer)','execute') as value"),false);
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id(3)})]);
 assert.equal(await scalar('select count(*)::int as value from memories'),0);
 await db.exec('reset role');
 const snapshot=async()=>{const result={};for(const t of ['relatives','family_members','families','memories','wearer_accounts','auth.users'])result[t]=(await db.query(`select to_jsonb(t) as row from ${t} t order by to_jsonb(t)::text`)).rows;return result};
 const beforeRetry=await snapshot();await db.exec(upgrade);assert.deepEqual(await snapshot(),beforeRetry);
 console.log('PASS legacy recovery: reported 010 failure, data preservation, membership bridge, main schema, family isolation, biometric restrictions and retry safety');
} finally {await db.close()}
