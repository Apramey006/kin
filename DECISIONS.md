# Design decisions

## Accounts and data ownership

- Supabase Auth identifies each account. Server APIs verify the session and
  derive family membership and contributor identity; client-supplied IDs are
  never sufficient authorization. RLS limits browser reads to the same family.
- Contributors each have one Keeper. A loved-one membership has no relative or
  Keeper, opens recognition directly, and cannot contribute or issue invitations.
- Only the family owner creates invitations. Contributor links are reusable;
  loved-one links are single-use, with at most one loved-one account per family.
- Media is private. The server issues short-lived signed URLs after checking
  membership. Families start empty; fixture seeding is a separate developer CLI.

## Recognition and cues

- Person identity requires enrolled photos from at least two distinct relatives.
  `match_keeper_faces` scopes retrieval by family and contributor before finding
  the nearest distinct people. Unknown, ambiguous, and conflicting matches abstain.
- Recall uses exact identity-to-memory provenance, not semantic similarity or
  vision descriptions, to identify a person. The weighted gate is a heuristic.
- Cue context is an attributed, verbatim transcript excerpt with a stored source.
  Relevant Weaver answers take priority; no model rewrites the spoken quote.
  If no excerpt fits the word budget, the cue contains only grounded identity.
- Replay reuses the latest successful observation, even after a silent attempt,
  and evaluates it against current family memories.
- A failing Keeper abstains. A failed recall remains silent and cannot reuse an
  earlier spoken cue. The interface gives quiet status feedback.

## Weaver and graph

- Graph relationships follow a constrained vocabulary. Existing node labels
  resolve identity; they are not evidence for new claims.
- Weaver excludes relatives who already supplied provenance for a gap and uses
  related photos as a routing tie-break. The prompt names the actual recipient.
- One open question per gap is enforced in SQL. Answers retain a link to the
  question's subject, including short answers that refer to it implicitly.
- Deleting a contribution removes its media, enrollment, unsupported graph facts,
  and cached questions/cues while preserving facts supported by other memories.
  Storage/database cleanup spans multiple operations; see RUST_HANDOFF.md.

## Providers

- `AI_PROVIDER=auto` prefers Anthropic when configured; otherwise it uses OpenAI.
  Explicit selection never silently falls back to another paid provider.
- Both providers return schema-validated extraction and descriptive photo captions.
  Captions never identify people. Deepgram transcribes; ElevenLabs voices cues,
  with browser speech as the client fallback.
- Anthropic mode makes no OpenAI calls. Legacy embedding columns receive zero
  placeholders, which are never interpreted as semantic vectors. OpenAI mode
  can still generate embeddings during ingestion.

## Interface

- System typography, neutral surfaces, blue actions, desktop navigation, and
  mobile tabs implement the supplied Apple design guidance.
- Sheets use interruptible position/velocity springs, pointer capture, projected
  momentum, and reduced-motion alternatives. Native dialogs manage modality.
- Recordings require stop, preview, then explicit save. Camera/microphone access
  starts from a user action. Recognition keeps one prominent primary action.
- The Connections map is an SVG view with an accessible list and detail inspector.
  Technical recognition signals sit in an optional information sheet.
- Larger text, reduced motion/transparency, high contrast, and keyboard access
  are supported. Automated checks complement physical-device testing.
