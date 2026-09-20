begin;
-- Fresh Supabase projects may not provide the old project's default table grants.
-- Keep authorization in the existing RLS policies; never expose face descriptors.
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on table
  public.relatives, public.wearer, public.memories, public.graph_nodes,
  public.graph_edges, public.provenance, public.face_embeddings,
  public.recall_events, public.weaver_questions, public.ingestion_receipts,
  public.wearer_accounts
to service_role;

grant select on table
  public.relatives, public.wearer, public.memories, public.graph_nodes,
  public.graph_edges, public.provenance, public.recall_events,
  public.weaver_questions, public.wearer_accounts
to authenticated;

revoke all on public.face_embeddings, public.ingestion_receipts from anon, authenticated;
commit;
