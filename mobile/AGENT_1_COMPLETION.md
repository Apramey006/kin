# Agent 1 Completion Report

## Summary

The Kin mobile app replicates the web app's design and flows as an Expo/React
Native iOS app for demo use. It has two modes reached from a landing-style
chooser and a floating bottom tab bar (matching the web mobile-nav):

- **Memories** (`app/family.tsx`) — the family library
- **Recognize** (`app/companion.tsx`) — the loved one's one-tap companion

The app runs in fixture mode by default (same seeded demo family as the web
app). Setting `EXPO_PUBLIC_API_URL` switches Recognize to the real
`/api/recall` pipeline with Bearer session auth.

## What changed in this pass

### Design parity with the web app
- `src/theme/colors.ts` / `typography.ts` now mirror `app/globals.css` tokens
  (paper `#F5F5F7`, ink `#1D1D1F`, accent `#0071E3`, cards, notices, pills).
- `src/components/ui.tsx` adds the shared primitives: Button variants,
  bottom-sheet `Sheet` modal, segmented control, notices, pills, avatars.
- `src/components/Brand.tsx` reproduces the heart KinMark via react-native-svg.
- `src/components/AppShell.tsx` adds the slim header (brand, family name,
  avatar) and the floating pill bottom nav (Memories / Recognize).

### Screens
- `app/index.tsx`: landing-style chooser ("A little help. A familiar world.")
  with two choice cards and the privacy footer.
- `app/family.tsx`: Memories library — header + Add button, "Sharing as"
  relative chips, Weaver question cards, segmented filter
  (All/Photos/Stories/By you), two-column memory grid, photo-stack empty
  state, library count, privacy note. Sheets for compose (photo/story
  choice), photo labeling, recording, Weaver answers, and delete confirm.
- `app/companion.tsx`: Recognize — camera intro orb and copy from `/wearer`,
  live `CameraView` with corner frame and status pill, large "Who is this?"
  action, cue card overlay, quiet state, error notice + retry.

### Components
- `MemoryCard.tsx`: photo/audio/caption cards with contributor meta, kind
  pill, playable voice memories, and delete affordance on your own.
- `PhotoUploader.tsx`: photo library or camera capture, simulated face box,
  person labeling (existing person / new person / skip), caption, consent.
- `Recorder.tsx`: mirrors the web recorder — red record button, timer, live
  bars, listen-back preview, record again / save. Real recording via
  expo-audio; backgrounding cancels and discards.
- `WeaverInbox.tsx`: "Question for you" prompt cards, answer sheet with
  recorder and the family's evidence.

### Adapters
- `src/adapters/audio.ts`: real recording (`useAudioRecorder`), real playback
  (`createAudioPlayer`, incl. base64 cues written to cache), TTS via
  expo-speech.
- `src/adapters/camera.ts`: permission flow, frame capture, and
  `captureAndCheckFace()` which runs `expo-face-detector` on the captured
  frame → `face | none | unknown`.

### Fixture mode behavior
- Recognize speaks a rotating grounded cue when a face is in frame and shows
  the quiet response when none is. If the detector module isn't bundled in
  the runtime, taps fall back to speaking; a long-press on "Who is this?"
  previews the quiet response.
- Family contributions are kept in local state and voice recordings play back
  from local URIs.

## Verification done here

- `npx tsc --noEmit` — clean
- `npx expo install --check` — clean
- `npx expo export --platform ios` — bundle succeeds

## Run it

```bash
cd mobile
npm install --legacy-peer-deps   # npm ci can fail on an optional react-dom peer
npm run ios                      # or: npm start, then scan with Expo Go
```

Optional backend:

```bash
cp .env.example .env
# EXPO_PUBLIC_API_URL=https://<your-backend>
```

## Not done / follow-ups

- No auth UI: fixture mode shares as a selectable relative; real API calls
  need a Supabase session token set via `apiClient.setSessionToken`.
- Photo uploads and Weaver answers don't post to the backend in fixture mode.
- Face recognition on device only checks presence (face vs none); identity
  comes from the backend when configured.
- expo-face-detector@13 predates SDK 57; it is loaded dynamically and the app
  degrades gracefully if it is missing. Verify on a real device/build.
- Stories/Connections/Settings pages remain web-only (Stage is the demo
  projector screen).
