# Kin

**The family doesn't train an AI. The family remembers together.**

Kin gives a family a collective memory. Each relative has a **Keeper** grounded
only in the photos, voice notes, and stories they contributed. When a person
with early-stage dementia taps one button and asks "who is this?", the Keepers
independently retrieve evidence, a deterministic **Gatekeeper** scores it, and
Kin whispers a short cue through the phone only when the evidence agrees.
Otherwise it stays silent. A **Family Weaver** finds gaps in the family memory
graph and asks the relative most likely to know.

Kin is a family memory and reminiscence-support prototype. It is not a medical
device and makes no clinical claims.

## Architecture

```mermaid
flowchart LR
    subgraph Family["Family members"]
        M[Maya] -->|photo + face label| P1[/api/memories/photo/]
        D[David] -->|voice story| P2[/api/memories/story/]
        E[Elena] -->|weaver answer| P3[/api/weaver/answer/]
    end

    P1 --> V[OpenAI vision caption] --> G[(family graph + memories)]
    P2 --> DG[Deepgram STT] --> X[extraction LLM] --> G
    P3 --> DG
    G --- PG[(pgvector embeddings + provenance)]

    W[Wearer: Who is this?] --> R[/api/recall/]
    R --> F[face-api descriptors] --> K1[Keeper Maya]
    R --> K2[Keeper David]
    R --> K3[Keeper Elena]
    K1 & K2 & K3 -->|v, r, claim, memoryIds| GT[Gatekeeper: C = .35V + .25R + .20A + .15S - .25X]
    GT -->|C >= 0.80| SY[grounded cue builder] --> EL[ElevenLabs TTS] --> W
    GT -->|else| S[SILENT]

    WV[Family Weaver] -->|gap detection| G
    WV -->|question| E

    G -.realtime.-> ST[/Stage dashboard/]
    R -.realtime.-> ST
```

## Stack

Next.js 14 (App Router, TypeScript), Tailwind, Supabase (Postgres + pgvector +
Storage + Realtime), face-api in the browser, OpenAI (vision, extraction,
embeddings, cue synthesis), Deepgram (STT), ElevenLabs (TTS), Vitest, Playwright.

## Setup

1. **Supabase**: create a project at supabase.com. In the SQL editor, run
   `supabase/migrations/001_init.sql` (it creates the schema, the `media`
   storage bucket, RLS read policies, and enables Realtime).

2. **Env vars**: `cp .env.example .env.local` and fill in Supabase URL + keys
   (Project Settings → API), `OPENAI_API_KEY`, `OPENAI_MODEL` (a current
   multimodal model), `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`, and
   `ELEVENLABS_VOICE_ID` (pick a calm, warm voice).

3. **Install and run**:

   ```bash
   npm install        # postinstall copies face-api weights to public/models
   npm run dev
   ```

4. **Seed**: `npm run seed`, or press "Seed demo" on `/stage`.

5. **Verify providers**: `curl localhost:3000/api/health`.

### Phones need HTTPS

Camera and microphone require a secure context. For local phone testing:

```bash
ngrok http 3000
```

and open the ngrok URL on the phone. For the demo, deploy to Vercel
(`vercel deploy`) and set the same env vars in the project.

## Tests

```bash
npm test           # vitest: gate, keepers, synthesize, weaver
npm run test:e2e   # playwright smoke test (loads /, /family, /wearer, /stage)
```

## Demo script (about 4 minutes)

1. **Three people remember.** Seed the demo. As Maya, upload 2 photos of a
   teammate playing "Nora" and label the face "Nora". As David, upload 1 photo
   of Nora and label it. Watch nodes animate onto the Stage graph, colored by
   contributor.
2. **Kin remembers without guessing.** On a phone open `/wearer`, point at the
   Nora teammate (or a printed photo), tap "Who is this?". On Stage: Maya and
   David's bars go high, Elena shows "no reliable memory", C is about 0.9,
   SPEAK. The cue plays through earbuds or speaker.
3. **Silence is a feature.** Point at a teammate who was never enrolled:
   SILENT, reason shown on Stage. Point at a water bottle: SILENT. Nothing is
   ever spoken on a guess.
4. **Kin notices what the family forgot.** Press "Run Weaver" on Stage. The
   lemon cake node pulses; David's inbox on `/family` shows the question.
   David records: "It was actually their mother's recipe. She brought it from
   Italy." The graph grows live: a great-grandmother fact and an origin edge.
5. **Closed loop.** Press "Replay last recall" on Stage (or tap again). The new
   cue includes the recipe's origin. Kin knows something it did not know two
   minutes ago, and every word came from a family member.

## Responsible design

- **Early-stage only.** Kin is for people who are still independent and lose
  small pieces of everyday context. It gives the smallest possible cue so the
  wearer reconnects the dots themselves. It does not diagnose, monitor, or
  replace memory.
- **Consent for faces.** A photo cannot be submitted without checking "I have
  permission to add this person's photo to our family memory." Face
  descriptors stay in the family's own database; no face is ever sent to a
  model for identification (the vision prompt describes, never identifies).
- **Silence over guessing.** Two outcomes only: SPEAK when independent family
  evidence agrees, SILENT otherwise. There is no "I think this might be..."
- **Not a medical device.** No clinical claims, no reminders, no tracking.
  Just the family, remembering together.
