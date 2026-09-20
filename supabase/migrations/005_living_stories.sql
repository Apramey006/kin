-- Timing metadata belongs to the original memory and inherits its RLS/deletion.
alter table public.memories
  add column if not exists audio_segments jsonb not null default '[]'::jsonb
  check (jsonb_typeof(audio_segments) = 'array');

comment on column public.memories.audio_segments is
  'Continuous original-audio passages: [{start: seconds, end: seconds, text: verbatim transcript}]. Empty for older recordings.';
