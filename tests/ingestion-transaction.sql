\set ON_ERROR_STOP on

create role anon;
create role authenticated;
create role service_role;
create schema extensions;
create table relatives(id uuid primary key, family_id text not null);
create table memories(
  id uuid primary key, family_id text not null, contributor_id uuid references relatives(id),
  kind text not null, media_path text, transcript text, caption text, summary text not null,
  embedding text not null check (jsonb_array_length(embedding::jsonb) = 1536),
  source_question_id uuid, created_at timestamptz default now()
);
create table graph_nodes(
  id uuid primary key, family_id text not null, type text not null, label text not null,
  aliases text[], relation_to_wearer text, created_at timestamptz default now()
);
create table graph_edges(
  id uuid primary key, family_id text not null, from_node uuid references graph_nodes(id),
  rel text not null, to_node uuid references graph_nodes(id), created_at timestamptz default now()
);
create table provenance(
  id uuid primary key default gen_random_uuid(), memory_id uuid references memories(id),
  node_id uuid references graph_nodes(id), edge_id uuid references graph_edges(id), contributor_id uuid references relatives(id)
);
create table face_embeddings(
  id uuid primary key, family_id text not null, person_node_id uuid references graph_nodes(id),
  contributor_id uuid references relatives(id), memory_id uuid references memories(id),
  descriptor text not null check (jsonb_array_length(descriptor::jsonb) = 128)
);
create table weaver_questions(
  id uuid primary key, family_id text not null, target_relative_id uuid references relatives(id),
  status text not null default 'open', answer_memory_id uuid references memories(id)
);
create function vector_dims(descriptor text) returns integer language sql immutable
  as 'select jsonb_array_length(descriptor::jsonb)';

\ir ../docs/agent-2-ingestion-migration.sql

insert into relatives values ('10000000-0000-4000-8000-000000000001', 'demo');
insert into weaver_questions(id, family_id, target_relative_id)
  values ('30000000-0000-4000-8000-000000000001', 'demo', '10000000-0000-4000-8000-000000000001');

do $$
declare
  contributor uuid := '10000000-0000-4000-8000-000000000001';
  memory_id uuid := '40000000-0000-4000-8000-000000000001';
  node_id uuid := '20000000-0000-4000-8000-000000000001';
  payload jsonb;
  invalid_payload jsonb;
  result jsonb;
  failed boolean := false;
begin
  payload := jsonb_build_object(
    'id', memory_id, 'family_id', 'demo', 'contributor_id', contributor, 'request_hash', 'original',
    'source', jsonb_build_object('type', 'human', 'consent', true),
    'response', jsonb_build_object('memory_id', memory_id),
    'memory', jsonb_build_object('id', memory_id, 'family_id', 'demo', 'contributor_id', contributor,
      'kind', 'answer', 'summary', 'Nora learned from her mother.',
      'source_question_id', '30000000-0000-4000-8000-000000000001',
      'embedding', to_jsonb(array_fill(0.01, array[1536]))),
    'nodes', jsonb_build_array(jsonb_build_object('id', node_id, 'family_id', 'demo', 'type', 'person', 'label', 'Nora')),
    'edges', '[]'::jsonb,
    'provenance', jsonb_build_array(jsonb_build_object('id', '50000000-0000-4000-8000-000000000001',
      'memory_id', memory_id, 'contributor_id', contributor, 'node_id', node_id))
  );
  invalid_payload := jsonb_set(payload, '{provenance,0,node_id}', '"99999999-0000-4000-8000-000000000001"');
  begin
    perform commit_ingestion(invalid_payload);
  exception when others then
    failed := true;
  end;
  if not failed or exists (select 1 from memories) or exists (select 1 from graph_nodes)
     or exists (select 1 from ingestion_receipts)
     or exists (select 1 from weaver_questions where status <> 'open') then
    raise exception 'Graph failure did not roll back all writes';
  end if;

  result := commit_ingestion(payload);
  if result is distinct from payload->'response'
     or (select count(*) from memories) <> 1
     or (select count(*) from provenance) <> 1
     or not exists (select 1 from weaver_questions where status = 'answered' and answer_memory_id = memory_id) then
    raise exception 'Successful answer did not commit graph and question';
  end if;
  result := commit_ingestion(payload);
  if result is distinct from payload->'response' or (select count(*) from memories) <> 1 then
    raise exception 'Retry was not idempotent';
  end if;
  failed := false;
  begin
    perform commit_ingestion(jsonb_set(payload, '{request_hash}', '"changed"'));
  exception when unique_violation then failed := true;
  end;
  if not failed then raise exception 'Changed retry was accepted'; end if;

  insert into memories(id, family_id, contributor_id, kind, summary, embedding)
    values ('40000000-0000-4000-8000-000000000002', 'demo', contributor, 'photo', 'Nora',
      to_jsonb(array_fill(0.01, array[1536]))::text);
  payload := jsonb_build_object('id', '60000000-0000-4000-8000-000000000001',
    'family_id', 'demo', 'contributor_id', contributor, 'request_hash', 'face',
    'source', jsonb_build_object('type', 'human', 'consent', true,
      'model', 'face-api-1.7.15:ssd-mobilenetv1:landmark68:recognition128:rgb-exif-v1'),
    'response', jsonb_build_object('ok', true),
    'face', jsonb_build_object('id', '60000000-0000-4000-8000-000000000001',
      'family_id', 'demo', 'contributor_id', contributor, 'person_node_id', node_id,
      'memory_id', '40000000-0000-4000-8000-000000000002', 'descriptor', to_jsonb(array_fill(0.1, array[128]))));
  failed := false;
  begin
    perform commit_ingestion(jsonb_set(payload, '{source,consent}', 'false'));
  exception when others then failed := true;
  end;
  if not failed or exists (select 1 from face_embeddings) then raise exception 'Consent not enforced'; end if;
  perform commit_ingestion(payload);
  perform commit_ingestion(payload);
  if (select count(*) from face_embeddings) <> 1 then raise exception 'Duplicate face'; end if;
  if has_function_privilege('anon', 'public.commit_ingestion(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.commit_ingestion(jsonb)', 'execute') then
    raise exception 'Public role can execute ingestion';
  end if;
  raise notice 'PASS: graph rollback, answer commit, idempotency, consent, face retry, RPC privileges';
end;
$$;
