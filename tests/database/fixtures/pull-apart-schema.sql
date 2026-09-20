-- Historical schema fixture from feature/pull-apart-stories at e2bd36b.

-- 001_init.sql
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

-- 002_demo_reliability.sql
-- Each Keeper searches only its contributor's enrollments. Return the closest
-- descriptor per person so duplicate photos cannot hide an ambiguous match.
create or replace function match_keeper_faces(query vector(128), family text, contributor uuid, k int)
returns table (person_node_id uuid, contributor_id uuid, memory_id uuid, distance float)
language sql stable as $$
  select matched.person_node_id, matched.contributor_id, matched.memory_id, matched.distance
  from (
    select distinct on (f.person_node_id)
      f.person_node_id, f.contributor_id, f.memory_id,
      (f.descriptor <-> query)::float as distance
    from face_embeddings f
    join memories m on m.id = f.memory_id
      and m.contributor_id = f.contributor_id and m.family_id = f.family_id
    where f.family_id = family and f.contributor_id = contributor
    order by f.person_node_id, f.descriptor <-> query
  ) matched
  order by matched.distance
  limit k
$$;

alter table recall_events add column if not exists cue_source jsonb;

-- Provenance is written after graph rows. Subscribe to it so source colors and
-- evidence refresh after ingestion has completed.
do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'provenance') then
    alter publication supabase_realtime add table provenance;
  end if;
end $$;

-- One outstanding request per gap, including concurrent button presses.
-- Existing demos may contain duplicates: retain the oldest open request.
delete from weaver_questions newer
using weaver_questions older
where newer.family_id = older.family_id
  and newer.gap_node_id = older.gap_node_id
  and newer.gap_type = older.gap_type
  and newer.status = 'open' and older.status = 'open'
  and (newer.created_at, newer.id) > (older.created_at, older.id);
create unique index if not exists one_open_question_per_gap
  on weaver_questions (family_id, gap_node_id, gap_type) where status = 'open';

-- 003_accounts.sql
-- Private family accounts. Run after 001 and 002. New accounts create empty
-- family libraries; this migration never inserts demo memories.
begin;
create table if not exists public.families (
  id text primary key,
  owner_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.family_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  family_id text not null references public.families(id) on delete cascade,
  relative_id uuid not null unique references public.relatives(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.family_invites (
  token uuid primary key default gen_random_uuid(),
  family_id text not null references public.families(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);
insert into public.families(id) select family_id from public.wearer on conflict do nothing;

create or replace function public.kin_family_id() returns text
language sql stable security definer set search_path = '' as $$
  select family_id from public.family_members where user_id = auth.uid()
$$;
revoke all on function public.kin_family_id() from public, anon;
grant execute on function public.kin_family_id() to authenticated, service_role;

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_invites enable row level security;
drop policy if exists "family read" on public.families;
create policy "family read" on public.families for select to authenticated using (id = public.kin_family_id());
drop policy if exists "membership read" on public.family_members;
create policy "membership read" on public.family_members for select to authenticated using (family_id = public.kin_family_id());
drop policy if exists "owner invite read" on public.family_invites;
create policy "owner invite read" on public.family_invites for select to authenticated using (
  exists(select 1 from public.families f where f.id = family_id and f.owner_id = auth.uid())
);
grant select on public.families, public.family_members, public.family_invites to authenticated;
grant all on public.families, public.family_members, public.family_invites to service_role;

-- Replace the prototype's public read policies, including direct REST access.
do $$ declare t text; begin
  foreach t in array array['relatives','wearer','memories','graph_nodes','graph_edges','face_embeddings','recall_events','weaver_questions'] loop
    execute format('drop policy if exists %I on public.%I', 'anon read ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'member read', t);
    execute format('create policy %I on public.%I for select to authenticated using (family_id = public.kin_family_id())', 'member read', t);
  end loop;
end $$;
drop policy if exists "anon read provenance" on public.provenance;
drop policy if exists "member read" on public.provenance;
create policy "member read" on public.provenance for select to authenticated using (
  exists(select 1 from public.memories m where m.id = memory_id and m.family_id = public.kin_family_id())
);
grant select on public.relatives, public.wearer, public.memories, public.graph_nodes,
  public.graph_edges, public.provenance, public.face_embeddings, public.recall_events,
  public.weaver_questions to authenticated;
-- Media is delivered by signed URLs after the server verifies family membership.
update storage.buckets set public = false where id = 'media';

create or replace function public.create_kin_family(loved_one text, member_name text, relationship text)
returns text language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); fid text := gen_random_uuid()::text; rid uuid;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  if exists(select 1 from public.family_members where user_id = uid) then raise exception 'Already a family member'; end if;
  if length(trim(loved_one)) not between 1 and 80 or length(trim(member_name)) not between 1 and 80 or length(trim(relationship)) not between 1 and 60 then raise exception 'Please complete all names and relationships'; end if;
  insert into public.families(id,owner_id) values(fid,uid);
  insert into public.wearer(family_id,name) values(fid,trim(loved_one));
  insert into public.relatives(family_id,name,relation_to_wearer,color) values(fid,trim(member_name),trim(relationship),'#6958C9') returning id into rid;
  insert into public.graph_nodes(family_id,type,label,relation_to_wearer) values(fid,'person',trim(loved_one),'self');
  insert into public.family_members(user_id,family_id,relative_id) values(uid,fid,rid);
  return fid;
end $$;
create or replace function public.join_kin_family(invite_code uuid, member_name text, relationship text)
returns text language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); fid text; rid uuid;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  if exists(select 1 from public.family_members where user_id = uid) then raise exception 'Already a family member'; end if;
  if length(trim(member_name)) not between 1 and 80 or length(trim(relationship)) not between 1 and 60 then raise exception 'Please complete your name and relationship'; end if;
  select family_id into fid from public.family_invites where token = invite_code and expires_at > now();
  if fid is null then raise exception 'This invitation has expired or is no longer available'; end if;
  insert into public.relatives(family_id,name,relation_to_wearer,color) values(fid,trim(member_name),trim(relationship),'#287D75') returning id into rid;
  insert into public.family_members(user_id,family_id,relative_id) values(uid,fid,rid);
  return fid;
end $$;
revoke all on function public.create_kin_family(text,text,text), public.join_kin_family(uuid,text,text) from public,anon;
grant execute on function public.create_kin_family(text,text,text), public.join_kin_family(uuid,text,text) to authenticated;
revoke all on function public.match_faces(vector,text,int), public.match_keeper_faces(vector,text,uuid,int), public.match_memories(vector,uuid,int) from public,anon;
grant execute on function public.match_faces(vector,text,int), public.match_keeper_faces(vector,text,uuid,int), public.match_memories(vector,uuid,int) to authenticated,service_role;
do $$ declare t text; begin
  foreach t in array array['memories','relatives','family_members'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
commit;

-- 004_loved_one_invites.sql
-- Separate the person using recognition from the people contributing memories.
-- Existing accounts and invitations remain contributors. No memories are changed.
begin;
alter table public.family_members add column if not exists role text not null default 'contributor';
alter table public.family_members alter column relative_id drop not null;
alter table public.family_members drop constraint if exists family_member_role;
alter table public.family_members add constraint family_member_role check (
  (role = 'contributor' and relative_id is not null) or
  (role = 'loved_one' and relative_id is null)
);
create unique index if not exists one_loved_one_per_family on public.family_members(family_id) where role = 'loved_one';
alter table public.family_invites add column if not exists role text not null default 'contributor';
alter table public.family_invites add column if not exists used_at timestamptz;
alter table public.family_invites drop constraint if exists family_invite_role;
alter table public.family_invites add constraint family_invite_role check (role in ('contributor','loved_one'));

create or replace function public.join_kin_family(invite_code uuid, member_name text, relationship text)
returns text language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); invitation public.family_invites%rowtype; rid uuid;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  if exists(select 1 from public.family_members where user_id = uid) then raise exception 'Already a family member'; end if;
  select * into invitation from public.family_invites
    where token = invite_code and expires_at > now() and used_at is null for update;
  if invitation.token is null then raise exception 'This invitation has expired or has already been used'; end if;
  if invitation.role = 'loved_one' then
    -- Serialize claims even when an organizer created more than one invitation.
    perform pg_advisory_xact_lock(hashtextextended(invitation.family_id, 1));
    if exists(select 1 from public.family_members where family_id = invitation.family_id and role = 'loved_one') then
      raise exception 'Your loved one already has an account in this family';
    end if;
    insert into public.family_members(user_id,family_id,relative_id,role)
      values(uid,invitation.family_id,null,'loved_one');
    update public.family_invites set used_at = now() where token = invite_code;
  else
    if member_name is null or relationship is null or length(trim(member_name)) not between 1 and 80 or length(trim(relationship)) not between 1 and 60 then
      raise exception 'Please complete your name and relationship';
    end if;
    insert into public.relatives(family_id,name,relation_to_wearer,color)
      values(invitation.family_id,trim(member_name),trim(relationship),'#287D75') returning id into rid;
    insert into public.family_members(user_id,family_id,relative_id,role)
      values(uid,invitation.family_id,rid,'contributor');
  end if;
  return invitation.family_id;
end $$;
revoke all on function public.join_kin_family(uuid,text,text) from public,anon;
grant execute on function public.join_kin_family(uuid,text,text) to authenticated;
commit;
