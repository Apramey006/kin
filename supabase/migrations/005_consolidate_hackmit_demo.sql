-- Consolidate the two inspected HackMIT demo families without resetting content.
-- Run after 004. Safe to repeat; aborts if legacy media/receipts need separate migration.
begin;
lock table public.relatives, public.wearer, public.memories, public.graph_nodes, public.graph_edges,
  public.provenance, public.weaver_questions, public.recall_events, public.face_embeddings,
  public.ingestion_receipts, public.wearer_accounts in share row exclusive mode;
create temporary table demo_id_map(old_id uuid primary key, new_id uuid not null) on commit drop;
insert into demo_id_map values
('78ca68f5-faf6-4070-86ea-ad4200f710b3','6ba867ac-36ef-432a-8306-1ce7f5df5289'),
('3b04e912-602e-4de3-9c15-d1f5e74f0348','adc50d52-40d5-48d6-8ce5-804724c71c49'),
('2c83b2ff-643d-4b6a-a336-dc23e970f3b2','54d2a843-200b-4a8f-b1d0-6fe280d1e527'),
('e63622fe-52d5-41b7-bf34-c86f148e5bc3','06f3db7e-ea88-477b-97fc-778c15d3cc77'),
('e25ba125-2d1b-47e8-888e-d17736e99b67','bd47d22a-bbfb-4e86-9377-34338a2078fc'),
('1060eff5-c94c-4322-b17d-fcda138e7379','584a1a5a-02f7-4a27-980f-6b3602e24870'),
('41c6e519-57de-416b-bbae-83ae775a9583','911ceea9-9471-4f3e-9104-e6d27948f1a5'),
('aac0ead0-f816-4e75-8ee8-64d4af9153ed','a229572b-aae2-461d-88ec-6c45c6bba721'),
('0f32622f-bf44-40b8-973a-c667a781eece','3fea8666-75d7-49e7-90c2-be8a03b50336'),
('7faa7f35-08c6-4952-b684-afcea4e262e0','bca60e67-1d43-48cc-b510-ff977a4979ff'),
('f3da9b49-8676-454f-836e-8f7e5dc0d9cf','dead6113-3807-4dbd-892b-bcd2106285e1'),
('be2842c3-2e93-430a-9723-5223737f8858','edd28736-a311-442a-82b4-9fe8b77b5965'),
('299c69a4-dbd9-4610-9823-7a11e3d9d645','786aea4d-ad12-463b-ad80-41ae399be1de'),
('fe263369-561b-4df4-bbbf-6010dec3d8a7','4937626b-01c9-43e0-96a9-d1a35f55d9a2');
do $$ begin
  if exists (select 1 from public.relatives where family_id='demo' and id not in (select old_id from demo_id_map))
    or exists (select 1 from public.memories where family_id='demo' and media_path is not null)
    or exists (select 1 from public.recall_events where family_id='demo' and snapshot_path is not null)
    or exists (select 1 from public.ingestion_receipts where family_id='demo')
    or exists (select 1 from storage.objects where bucket_id='media' and name like 'demo/%') then
    raise exception 'Legacy demo changed since inspection; inspect media, memberships and receipts before consolidating';
  end if;
  if exists (select 1 from public.wearer where family_id='demo') and not exists
    (select 1 from public.wearer where family_id='670f5075-c286-4b29-8074-86401c18d0c0' and name='Rosa') then
    raise exception 'Shared canonical family missing; do not create a parallel family';
  end if;
end $$;
create or replace function pg_temp.remap_demo(value jsonb) returns jsonb language plpgsql as $$
declare pair record; rendered text := value::text;
begin
  for pair in select * from demo_id_map loop rendered := replace(rendered, pair.old_id::text, pair.new_id::text); end loop;
  return rendered::jsonb;
end $$;
update public.memories m set contributor_id=x.new_id from demo_id_map x where m.contributor_id=x.old_id;
update public.provenance p set contributor_id=x.new_id from demo_id_map x where p.contributor_id=x.old_id;
update public.face_embeddings f set contributor_id=x.new_id from demo_id_map x where f.contributor_id=x.old_id;
update public.weaver_questions q set target_relative_id=x.new_id from demo_id_map x where q.target_relative_id=x.old_id;
update public.provenance p set node_id=x.new_id from demo_id_map x where p.node_id=x.old_id;
update public.provenance p set edge_id=x.new_id from demo_id_map x where p.edge_id=x.old_id;
update public.face_embeddings f set person_node_id=x.new_id from demo_id_map x where f.person_node_id=x.old_id;
update public.weaver_questions q set gap_node_id=x.new_id from demo_id_map x where q.gap_node_id=x.old_id;
-- Edges already represented in the richer graph retain that graph's IDs.
delete from public.graph_edges where id in (select old_id from demo_id_map);
update public.graph_edges e set from_node=x.new_id from demo_id_map x where e.from_node=x.old_id;
update public.graph_edges e set to_node=x.new_id from demo_id_map x where e.to_node=x.old_id;
delete from public.graph_nodes where id in (select old_id from demo_id_map);
update public.memories set verified_facts=pg_temp.remap_demo(verified_facts), source=pg_temp.remap_demo(source) where family_id='demo';
update public.weaver_questions set evidence=pg_temp.remap_demo(evidence) where family_id='demo';
update public.recall_events set keeper_results=pg_temp.remap_demo(keeper_results), gate=pg_temp.remap_demo(gate), evidence=pg_temp.remap_demo(evidence), face_outcome=pg_temp.remap_demo(face_outcome) where family_id='demo';
-- Preserve a redundant open question as superseded, never falsely answered.
alter table public.weaver_questions drop constraint weaver_questions_status_check;
alter table public.weaver_questions add constraint weaver_questions_status_check check (status in ('open','answered','superseded'));
update public.weaver_questions old set status='superseded'
where old.family_id='demo' and old.status='open' and exists (
  select 1 from public.weaver_questions current where current.family_id='670f5075-c286-4b29-8074-86401c18d0c0'
    and current.status='open' and current.gap_node_id=old.gap_node_id and current.gap_type=old.gap_type
);
do $$ declare t text; begin
  foreach t in array array['memories','graph_nodes','graph_edges','face_embeddings','recall_events','weaver_questions','wearer_accounts'] loop
    execute format('update public.%I set family_id=%L where family_id=%L',t,'670f5075-c286-4b29-8074-86401c18d0c0','demo');
  end loop;
end $$;
delete from public.relatives where family_id='demo';
delete from public.wearer where family_id='demo';
commit;
