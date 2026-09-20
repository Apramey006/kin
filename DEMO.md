# Kin: three-minute demo

## Start fresh

Follow README setup, including migrations 001–010 and Supabase Auth callback
URLs. Create an account and an empty family. Invite two relatives from Settings.
Use separate browser profiles/devices, each signed into its own account. Do not
run seed: the app starts without sample memories or enrolled faces.

Camera and microphone require localhost or HTTPS. Open `/stage` (Connections)
on the projector, `/wearer` (Recognize) on the phone, and `/family` (Memories)
on the contributors' devices. Test earbud output before presenting.

## Prepare

With permission, use two clear photos of one teammate to represent Nora.
The first relative adds Nora with relationship “sister”; the second selects the
same existing Nora when labeling their photo. Both check photo/recognition permission.

Suggested fictional recordings:

- Maya: “Nora and Rosa baked lemon cake every Sunday. Nora always wore a yellow apron.”
- Elena: “Nora taught Rosa to cook. They baked lemon cake together on Sundays.”
- David's later answer: “The Sunday lemon cake recipe came from their mother in Italy.”

For David to be the likely source of the recipe-origin question, he can first
share a photo of a recipe book with a caption explaining its family connection.
Question routing depends on the memories actually contributed, so rehearse it.

## Rehearse

| Time | Action | Expected result |
| --- | --- | --- |
| 0:00–0:45 | Two relatives add labeled photos and different voice stories. Stop, preview, then Save memory. | Contributions appear under the correct signed-in person. |
| 0:45–1:15 | Open camera, frame Nora or her photo, tap Who is this? | A grounded cue when two independent Keepers support it. Connections shows the sources. |
| 1:15–1:35 | Frame an unenrolled person and tap again. | No clear match; no cue is spoken. |
| 1:35–2:00 | Select Find a question in Connections. | The selected relative receives the question in Memories. |
| 2:00–2:35 | That relative records, previews, and saves the answer. | The answer becomes a memory and adds connections to the map. |
| 2:35–3:00 | Replay known person (or Listen again) in Connections. | The saved successful observation is reused; the new answer can be heard in the cue. |

Select a map node to explore its connections. Switch to the list for full text.
The information button opens recognition signals and timing for technical questions.

## Verify

Complete three full rehearsals with the intended phone and earbuds. Capture event
IDs, question/answer, before/after cue, and duration. Passing automated checks does
not prove the physical camera, microphone, or audible output on your devices.

## Recover

- No family: finish onboarding or use the invitation link while signed in.
- Confirmation/reset link returns to the wrong page: add the app callback URLs in Supabase Auth settings.
- Photo cannot save: wait for detection, label each face you want to enroll or explicitly skip it, and check permission.
- No recognition: enroll a clear photo and add supporting human memories from two relatives. Use a clear single face; don't lower the gate.
- No voice: check output volume, earbuds, ElevenLabs settings, and browser speech support.
- No new question: check the existing recipient's inbox; open questions are not duplicated.
- Delete an upload: use its trash button in Memories and confirm. Its media, enrollment,
  unsupported graph facts, and stale cached cues are removed; other contributions stay.
