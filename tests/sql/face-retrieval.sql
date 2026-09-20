-- Run after both migrations in an isolated database; fixture rows roll back.
begin;
do $$
declare
  maya uuid := gen_random_uuid();
  elena uuid := gen_random_uuid();
  nora uuid := gen_random_uuid();
  other_person uuid := gen_random_uuid();
  photo uuid;
  query vector(128) := array_fill(0::real, ARRAY[128])::vector;
  found int;
begin
  insert into relatives values
    (maya, 'test', 'Maya', 'granddaughter', '#123'),
    (elena, 'test', 'Elena', 'daughter', '#456');
  insert into graph_nodes (id, family_id, type, label) values
    (nora, 'test', 'person', 'Nora'), (other_person, 'test', 'person', 'Other');
  -- Many duplicate Maya photos must not starve Elena or hide another person.
  for i in 1..8 loop
    insert into memories (family_id, contributor_id, kind, summary, embedding)
      values ('test', maya, 'photo', 'Nora photo', array_fill(0::real, ARRAY[1536])::vector)
      returning id into photo;
    insert into face_embeddings (family_id, person_node_id, contributor_id, memory_id, descriptor)
      values ('test', nora, maya, photo, query);
  end loop;
  insert into memories (family_id, contributor_id, kind, summary, embedding)
    values ('test', elena, 'photo', 'Nora photo', array_fill(0::real, ARRAY[1536])::vector)
    returning id into photo;
  insert into face_embeddings (family_id, person_node_id, contributor_id, memory_id, descriptor)
    values ('test', nora, elena, photo, query);
  insert into memories (family_id, contributor_id, kind, summary, embedding)
    values ('test', maya, 'photo', 'Other photo', array_fill(0::real, ARRAY[1536])::vector)
    returning id into photo;
  insert into face_embeddings (family_id, person_node_id, contributor_id, memory_id, descriptor)
    values ('test', other_person, maya, photo, array_fill(0.03::real, ARRAY[128])::vector);

  select count(*) into found from match_keeper_faces(query, 'test', maya, 5);
  assert found = 2, 'Duplicate enrollments must return one nearest result per person';
  select count(*) into found from match_keeper_faces(query, 'test', elena, 5);
  assert found = 1, 'Elena must retain her result even when Maya has many closer photos';
  assert not exists (select 1 from match_keeper_faces(query, 'test', elena, 5) where contributor_id <> elena), 'Keeper contributor isolation';
  assert not exists (select 1 from match_keeper_faces(query, 'another-family', elena, 5)), 'Family isolation';
  assert (select distance from match_keeper_faces(query, 'test', elena, 5) limit 1) = 0, 'Identical descriptor distance';

  insert into weaver_questions (family_id, target_relative_id, gap_node_id, gap_type, question_text, evidence)
    values ('test', maya, nora, 'unrelated_person', 'How are you related?', '[]');
  begin
    insert into weaver_questions (family_id, target_relative_id, gap_node_id, gap_type, question_text, evidence)
      values ('test', elena, nora, 'unrelated_person', 'Duplicate question', '[]');
    raise exception 'Duplicate open gap was allowed';
  exception when unique_violation then null;
  end;
end $$;
rollback;
