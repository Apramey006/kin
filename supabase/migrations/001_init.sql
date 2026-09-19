create extension if not exists vector;

create table relatives (            -- a Keeper owner
  id uuid primary key default gen_random_uuid(),
  family_id text not null,
  name text not null,
  relation_to_wearer text not null, -- "granddaughter", "son", ...
  color text not null               -- hex, used on Stage
);

create table wearer (
  family_id text primary key,
  name text not null                -- e.g. "Rosa"
);

create table memories (
  id uuid primary key default gen_random_uuid(),
  family_id text not null,
  contributor_id uuid not null references relatives(id) on delete cascade,
  kind text not null check (kind in ('photo','story','answer')),
  media_path text,                  -- storage path for photo or audio
  transcript text,                  -- stories/answers
  caption text,                     -- photos: vision caption
  summary text not null,            -- one-sentence normalized memory text
  embedding vector(1536) not null,
  source_question_id uuid,          -- set for Weaver answers
  created_at timestamptz default now()
);
create index on memories using hnsw (embedding vector_cosine_ops);
create index on memories (contributor_id);

create table graph_nodes (
  id uuid primary key default gen_random_uuid(),
  family_id text not null,
  type text not null check (type in ('person','event','tradition','object','place')),
  label text not null,              -- "Nora", "Sunday lemon cake baking"
  aliases text[] default '{}',
  relation_to_wearer text,          -- only for person nodes
  created_at timestamptz default now()
);

create table graph_edges (
  id uuid primary key default gen_random_uuid(),
  family_id text not null,
  from_node uuid not null references graph_nodes(id) on delete cascade,
  rel text not null,                -- see allowed list in lib/graph.ts
  to_node uuid not null references graph_nodes(id) on delete cascade,
  created_at timestamptz default now()
);

create table provenance (           -- every node and edge must cite >=1 memory
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references memories(id) on delete cascade,
  node_id uuid references graph_nodes(id) on delete cascade,
  edge_id uuid references graph_edges(id) on delete cascade,
  contributor_id uuid not null references relatives(id) on delete cascade
);

create table face_embeddings (      -- only explicitly enrolled family members
  id uuid primary key default gen_random_uuid(),
  family_id text not null,
  person_node_id uuid not null references graph_nodes(id) on delete cascade,
  contributor_id uuid not null references relatives(id) on delete cascade,
  memory_id uuid not null references memories(id) on delete cascade,
  descriptor vector(128) not null
);

create table recall_events (        -- drives the Stage in real time
  id uuid primary key default gen_random_uuid(),
  family_id text not null,
  status text not null check (status in ('running','speak','silent')),
  snapshot_path text,
  keeper_results jsonb,             -- array of KeeperResult
  gate jsonb,                       -- GateResult
  cue_text text,
  silence_reason text,
  latency_ms int,
  face_descriptors jsonb,           -- stored for "Replay last recall"
  created_at timestamptz default now()
);

create table weaver_questions (
  id uuid primary key default gen_random_uuid(),
  family_id text not null,
  target_relative_id uuid not null references relatives(id),
  gap_node_id uuid references graph_nodes(id),
  gap_type text not null,
  question_text text not null,
  evidence jsonb not null,          -- [{memory_id, contributor_id, summary}]
  status text not null default 'open' check (status in ('open','answered')),
  answer_memory_id uuid references memories(id),
  created_at timestamptz default now()
);

-- Euclidean face match: nearest enrolled descriptors within one family.
create or replace function match_faces(query vector(128), family text, k int)
returns table (person_node_id uuid, contributor_id uuid, memory_id uuid, distance float)
language sql stable as $$
  select person_node_id, contributor_id, memory_id,
         (descriptor <-> query) as distance
  from face_embeddings
  where family_id = family
  order by descriptor <-> query
  limit k
$$;

-- Cosine memory match restricted to one contributor (their Keeper's namespace).
create or replace function match_memories(query vector(1536), contributor uuid, k int)
returns table (id uuid, summary text, similarity float)
language sql stable as $$
  select id, summary,
         1 - (embedding <=> query) as similarity
  from memories
  where contributor_id = contributor
  order by embedding <=> query
  limit k
$$;

-- Realtime
alter publication supabase_realtime add table recall_events;
alter publication supabase_realtime add table graph_nodes;
alter publication supabase_realtime add table graph_edges;
alter publication supabase_realtime add table weaver_questions;

-- Demo has no auth; anon clients only need read access for the UI + Realtime.
alter table relatives enable row level security;
alter table wearer enable row level security;
alter table memories enable row level security;
alter table graph_nodes enable row level security;
alter table graph_edges enable row level security;
alter table provenance enable row level security;
alter table face_embeddings enable row level security;
alter table recall_events enable row level security;
alter table weaver_questions enable row level security;

create policy "anon read relatives" on relatives for select using (true);
create policy "anon read wearer" on wearer for select using (true);
create policy "anon read memories" on memories for select using (true);
create policy "anon read graph_nodes" on graph_nodes for select using (true);
create policy "anon read graph_edges" on graph_edges for select using (true);
create policy "anon read provenance" on provenance for select using (true);
create policy "anon read face_embeddings" on face_embeddings for select using (true);
create policy "anon read recall_events" on recall_events for select using (true);
create policy "anon read weaver_questions" on weaver_questions for select using (true);

-- Storage bucket for photos, audio, and recall snapshots.
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;
