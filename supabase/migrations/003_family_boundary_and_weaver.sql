begin;

alter table public.recall_events add column face_outcome jsonb;
alter table public.recall_events add column evidence jsonb;
alter table public.recall_events add column reason_code text;
alter table public.recall_events add column selected_fact_ids jsonb not null default '[]'::jsonb;

-- Claims are admin-issued app_metadata, never user-editable user_metadata.
-- Definer avoids recursive relatives RLS while requiring a real membership row.
create function public.kin_has_membership() returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (select 1 from public.relatives r where r.id::text = auth.jwt()->'app_metadata'->>'kin_contributor_id'
    and r.family_id = auth.jwt()->'app_metadata'->>'kin_family_id')
$$;
revoke all on function public.kin_has_membership() from public, anon;
grant execute on function public.kin_has_membership() to authenticated, service_role;
do $$
declare t text;
begin
  foreach t in array array['relatives','wearer','memories','graph_nodes','graph_edges','recall_events','weaver_questions'] loop
    execute format('drop policy if exists %I on public.%I', 'anon read ' || t, t);
    execute format('create policy family_read on public.%I for select to authenticated using (family_id = (auth.jwt()->''app_metadata''->>''kin_family_id'') and exists (select 1 from public.relatives membership where membership.id::text = (auth.jwt()->''app_metadata''->>''kin_contributor_id'') and membership.family_id = (auth.jwt()->''app_metadata''->>''kin_family_id'')))', t);
  end loop;
end $$;
-- Avoid recursive policy evaluation on relatives.
drop policy family_read on public.relatives;
create policy family_read on public.relatives for select to authenticated using (
  family_id = auth.jwt()->'app_metadata'->>'kin_family_id'
  and public.kin_has_membership()
);
drop policy if exists "anon read provenance" on public.provenance;
create policy family_read on public.provenance for select to authenticated using (
  exists (select 1 from public.memories m where m.id = memory_id
    and m.family_id = auth.jwt()->'app_metadata'->>'kin_family_id')
);
drop policy if exists "anon read face_embeddings" on public.face_embeddings;
-- Descriptors never leave privileged server access, including authenticated browsers.
revoke all on public.face_embeddings from anon, authenticated;
revoke all on function public.match_faces(vector, text, integer) from public, anon, authenticated;
revoke all on function public.match_memories(vector, uuid, integer) from public, anon, authenticated;
grant execute on function public.match_faces(vector, text, integer) to service_role;
grant execute on function public.match_memories(vector, uuid, integer) to service_role;

create function public.match_subject_memories(query vector(1536), family text, contributor uuid, subject uuid, k int)
returns table (id uuid, summary text, similarity float)
language sql stable set search_path = public, extensions as $$
  select m.id, m.summary, 1 - (m.embedding <=> query) as similarity
  from public.memories m
  where m.family_id = family and m.contributor_id = contributor
    and m.source->>'type' = 'human'
    and jsonb_array_length(m.verified_facts) > 0
    and exists (select 1 from public.provenance p where p.memory_id = m.id
      and p.node_id = subject and p.contributor_id = contributor)
  order by m.embedding <=> query
  limit greatest(0, least(k, 50))
$$;
revoke all on function public.match_subject_memories(vector,text,uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.match_subject_memories(vector,text,uuid,uuid,integer) to service_role;

-- At most one unfinished question for a graph gap, including concurrent run requests.
delete from public.weaver_questions older using public.weaver_questions newer
where older.status = 'open' and newer.status = 'open'
  and older.family_id = newer.family_id and older.gap_node_id = newer.gap_node_id
  and older.gap_type = newer.gap_type and (older.created_at, older.id) > (newer.created_at, newer.id);
create unique index weaver_one_open_gap on public.weaver_questions(family_id, gap_node_id, gap_type) where status = 'open';
create unique index weaver_one_answer on public.memories(source_question_id) where kind = 'answer';

update storage.buckets set public = false where id = 'media';
create policy family_media_read on storage.objects for select to authenticated using (
  bucket_id = 'media' and (storage.foldername(name))[1] = auth.jwt()->'app_metadata'->>'kin_family_id'
  and exists (select 1 from public.relatives r where r.id::text = auth.jwt()->'app_metadata'->>'kin_contributor_id'
    and r.family_id = auth.jwt()->'app_metadata'->>'kin_family_id')
);
-- Full row payloads make update/delete subscriptions deterministic under family RLS.
alter table public.weaver_questions replica identity full;
alter table public.recall_events replica identity full;
alter table public.graph_nodes replica identity full;
alter table public.graph_edges replica identity full;
commit;
