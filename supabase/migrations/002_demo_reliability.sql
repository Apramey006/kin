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
