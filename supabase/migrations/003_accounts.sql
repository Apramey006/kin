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
