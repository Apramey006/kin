# DECISIONS

Ambiguities resolved while building Kin. Each picks the simplest option that
satisfies the spec's acceptance criteria.

- **Weaver routing exclusion.** The spec's scoring formula alone would route the
  lemon-cake question to Maya (her story touches both the gap and its
  neighbors), but the demo script requires David. Interpretation implemented:
  relatives whose memories already provide provenance for the gap node itself
  are excluded from routing — the Weaver asks someone whose contributions sit
  *next to* the gap but who has not described it. Ties then go to the relative
  who uploaded a related photo, which selects David over Elena deterministically.

- **David's seed memory has `kind='photo'`** (text stand-in, no media file), so
  the routing tie-break "uploaded a related photo" works on a fresh seed.

- **`recall_events.face_descriptors` (jsonb) column added** beyond the printed
  schema to support "Replay last recall" as specified in Section 9.5/10.7.

- **RLS enabled with permissive `select using (true)` policies** on all tables.
  The demo has no auth; anon clients only read (Realtime + initial fetch). All
  writes go through the service role on the server, which bypasses RLS.

- **Storage bucket `media` is created inside the migration** (`insert into
  storage.buckets ... on conflict do nothing`) so setup is one step.

- **React Flow v11 (`reactflow` package)** rather than the v12 `@xyflow/react`
  rename; both are "React Flow". v11 chosen for the stable, well-known API.

- **shadcn/ui**: implemented as local `components/ui/*` primitives in the
  shadcn style (cva + radix-slot) instead of running the shadcn CLI, which is
  interactive. Dropdowns use native `<select>` for mobile reliability.

- **Single-claimant agreement**: `A = 0.75` only when exactly one Keeper claims
  and none disagree (per spec). With one claimant and one dissenter the gate
  exits earlier on `X > 0` anyway.

- **S signal**: `1.0` requires every agreeing Keeper to cite at least one memory
  it owns *and* the subject node to have provenance; drops to `0.5` when the
  evidence is text-only (no face match and no photo-kind memory cited); `0`
  otherwise.

- **Silence on the wearer screen**: on SILENT the client literally does nothing
  (no audio, no message). A camera-not-ready message is the only error the
  wearer can ever see.

- **Cue fallback template** is `You two {node label}.` per spec; labels that
  read as verb phrases (e.g. "bake lemon cake on Sundays") make it natural.

- **`match_memories`/`match_faces` take vector params as JSON strings** from the
  JS client (`JSON.stringify(descriptor)`), which pgvector accepts for
  `vector` casts via the RPC parameter binding.

- **Seed writes the graph literally** (no LLM extraction at seed time) so the
  Weaver outcome in Section 11 is deterministic and unit-testable.

- **Keeper error containment**: a failing keeper resolves to an abstain result
  so one bad query cannot kill a recall.

- **No em dashes in UI copy.**
