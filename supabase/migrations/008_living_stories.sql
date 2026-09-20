-- Timing metadata belongs to the original memory and inherits its RLS/deletion.
alter table public.memories
  add column if not exists audio_segments jsonb not null default '[]'::jsonb
  check (jsonb_typeof(audio_segments) = 'array');

comment on column public.memories.audio_segments is
  'Continuous original-audio passages: [{start: seconds, end: seconds, text: verbatim transcript}]. Empty for older recordings.';

-- Preserve the existing atomic ingestion and wearer-review RPCs. Timing is
-- committed inside memory.source; mirror it on insert/update for story readers.
create or replace function public.sync_memory_audio_segments() returns trigger
language plpgsql set search_path = public as $$
begin
  if jsonb_typeof(new.source->'audio_segments') = 'array' then
    new.audio_segments := new.source->'audio_segments';
  end if;
  new.audio_segments := coalesce(new.audio_segments, '[]'::jsonb);
  return new;
end;
$$;
create trigger sync_memory_audio_segments before insert or update of source on public.memories
for each row execute function public.sync_memory_audio_segments();
update public.memories set audio_segments = source->'audio_segments'
where jsonb_typeof(source->'audio_segments') = 'array';
