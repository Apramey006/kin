import { test, expect, familyFixture } from "./fixtures";

// Real browser camera capture and face models; only the backend response is
// stubbed. This verifies UI/media behavior, not live face-recognition accuracy.

test("a new silent recall never replays the previous cue", async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    const calls: string[] = [];
    Object.assign(window, { audioCalls: calls });
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this instanceof HTMLAudioElement) {
        calls.push(this.src);
        return Promise.resolve();
      }
      return originalPlay.call(this);
    };
  });
  let requests = 0;
  await page.route("**/api/recall", async (route) => {
    requests++;
    // The blank camera frame was actually passed through the face models.
    expect(route.request().postData()).toContain("faceDescriptors");
    await route.fulfill({
      json:
        requests === 1
          ? {
              decision: "speak",
              cueText: "That's Nora, your sister.",
              audio: "dGVzdC1jdWU=",
            }
          : { decision: "silent", reason: "no reliable memory" },
    });
  });
  await page.route("**/api/family", (r) =>
    r.fulfill({ json: familyFixture() }),
  );
  await page.goto("/wearer");
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  // An intercepted play method must not prevent the live video element playing.
  await page.locator("video").evaluate((video: HTMLVideoElement) => {
    video.autoplay = true;
  });
  await expect
    .poll(() =>
      page.locator("video").evaluate((v: HTMLVideoElement) => v.videoWidth),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Who is this?" }).click();
  await expect(page.getByText("That's Nora, your sister.")).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByRole("button", { name: "Who is this?" })).toBeEnabled({
    timeout: 12000,
  });
  const countBefore = await page.evaluate(
    () => (window as unknown as { audioCalls: string[] }).audioCalls.length,
  );
  await page.getByRole("button", { name: "Who is this?" }).click();
  await expect.poll(() => requests).toBe(2);
  await expect(
    page.getByRole("button", { name: "Who is this?" }),
  ).toBeEnabled();
  await expect(page.getByText("That's Nora, your sister.")).not.toBeVisible();
  const newAudio = await page.evaluate(
    (count) =>
      (window as unknown as { audioCalls: string[] }).audioCalls.slice(count),
    countBefore,
  );
  expect(newAudio.length).toBe(1);
  expect(newAudio[0]).not.toContain("dGVzdC1jdWU=");
});
