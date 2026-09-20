# Living Stories

Open **Living Stories** from the family or wearer screen, or visit `/stories`. Wearer accounts start in Quiet view.

## Listening together

The library groups original recordings by their recorded person, place, event,
object, or tradition. Chapters alternate contributors while preserving each
contributor's upload order. Upload dates do not imply when a remembered event
happened. Different accounts remain separate, attributed contributions.

Each chapter has playback, pause, seeking, previous/next, the original transcript
and full source audio. Related photos retain their own attribution. The map shows
only the entities and relationships supported by the active contribution.  Quiet view removes the chapter list and map and
enlarges the listening controls. No audio starts on initial navigation.

After a chapter finishes, the next recording starts when the browser permits it;
otherwise Play remains available. Playback pauses when opening source details,
recording a contribution, or hiding the tab. It stops at the final chapter.
Refreshes preserve the current chapter. Newly saved sources appear in a
**Hear what's new** notice; deleted sources are removed from the player.

## Add a chapter

**Add your part** records up to 60 seconds, previews it, and saves only after an
explicit Save memory. The server checks contributor membership and topic family
ownership before upload/transcription. The chosen topic becomes a provenance
link; it is not evidence for a new graph relationship.

**Find a missing piece** runs the existing Weaver only for the selected topic.
Questions appear in the recipient's Memories inbox and on the story. Answering
one uses the existing answer ingestion flow and creates another chapter. If no
new gap is available, the interface says so. Existing duplicate-question and
recipient-routing rules still apply.

## Audio timing migration

Apply `supabase/migrations/008_living_stories.sql` after the existing migrations through 007 to retain
timings on new voice memories and Weaver answers. This adds an `audio_segments`
JSONB column to `memories`, inheriting existing family RLS and deletion behavior.

The Deepgram adapter requests utterances and accepts their timestamps only when
they are finite, ordered, and their text occurs verbatim in the full transcript.
The player selects a continuous topic-matching passage, including neighboring
utterances when they fit a 35-second window. An individual long utterance is kept
intact. It never splices separate words into a new sentence or generates a voice.

Older recordings play in full. New timings are committed inside `memory.source` through the existing atomic ingestion and wearer-review RPCs. Migration 008 mirrors that metadata to `audio_segments`; before it is applied, playback reads timings from `source`. There is no automatic retranscription or provider spending on playback.

`GET /api/stories/:id` checks the session family, loads that family's source, and
returns only transcript, validated timings, and a refreshed private signed URL.
Responses are `private, no-store`. It does not return embeddings or internal paths.
The planner uses the existing family snapshot, which currently has unpaginated
reads; large-library pagination remains an existing limitation.

## Verification

`npm test` includes planning/provenance, timing validation, media authorization,
topic-scoped ingestion, schema compatibility, and Weaver topic filtering.

`npx playwright test e2e/living-stories.spec.ts` exercises desktop/mobile layouts
and accessibility, real HTML audio controls with a fixture WAV, chapter changes,
new/deleted contributions, recorder preview/save, and loved-one controls. It uses
the existing browser-only authentication fixture and intercepts family/media/provider data.
Phone/Safari playback and real provider transcription still need device testing.

The merge preserves main’s authentication, atomic ingestion, self-contribution review, Memory Atlas, and pull-apart stories.
