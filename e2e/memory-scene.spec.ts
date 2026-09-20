import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures";
import { addSceneAnswer, sceneFixture } from "../tests/fixtures/memory-scene";
import type { Page } from "@playwright/test";

async function openScene(page: Page) {
  await page.goto("/family");
  await page.getByRole("button", { name: /A story to step inside/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Sunday lemon cake" }),
  ).toBeVisible();
}
async function audit(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document.getAnimations().map((a) => a.finished.catch(() => {})),
    ),
  );
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
}

for (const width of [375, 1440]) {
  test(`story unfolds into readable perspectives at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route("**/api/family", (r) =>
      r.fulfill({ json: sceneFixture() }),
    );
    await openScene(page);
    await audit(page);
    await page.screenshot({ path: `test-results/story-folded-${width}.png` });
    await page.locator(".scene-photograph").click();
    await expect(page.locator(".scene-world")).toHaveClass(/is-unfolded/);
    await expect
      .poll(() =>
        page
          .locator(".scene-world")
          .evaluate((el) => el.style.getPropertyValue("--unfold")),
      )
      .toBe("1");
    await audit(page);
    await page.screenshot({
      path: `test-results/story-unfolded-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Explore Maya’s memory", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Maya remembers" }),
    ).toBeFocused();
    await expect(page.locator(".scene-detail")).toContainText(
      "before we even opened the door",
    );
    await audit(page);
    await page.screenshot({ path: `test-results/story-detail-${width}.png` });
    await page.getByRole("button", { name: "Close memory details" }).click();
    await expect(
      page.getByRole("button", { name: "Explore Maya’s memory", exact: true }),
    ).toBeFocused();
    await page
      .getByRole("button", { name: "Explore the missing piece" })
      .click();
    await expect(page.locator(".scene-detail")).toContainText(
      "Waiting for David",
    );
    await expect(
      page.getByRole("button", {
        name: "Record the missing piece",
        exact: true,
      }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: /A story to step inside/ }),
    ).toBeFocused();
    if (width === 1440) {
      await page.goto("/stage");
      await page
        .getByRole("button", { name: /A story to step inside/ })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Sunday lemon cake" }),
      ).toBeVisible();
    }
  });
}

test("an answer arrives live; only evidence of an origin completes the connection", async ({
  page,
}) => {
  const data = sceneFixture();
  await page.route("**/api/family", (r) => r.fulfill({ json: data }));
  await openScene(page);
  await page.locator(".scene-photograph").click();
  addSceneAnswer(data, false);
  await page.getByRole("button", { name: "Check for new memories" }).click();
  await expect(page.locator(".scene-arrival")).toContainText(
    "origin is still open",
  );
  await page.getByRole("button", { name: "Explore the missing piece" }).click();
  await expect(page.locator(".scene-detail")).toContainText("I don’t know");
  await page.getByRole("button", { name: "Close memory details" }).click();
  data.memories = data.memories.filter((m) => m.id !== "answer");
  addSceneAnswer(data);
  await page.getByRole("button", { name: "Check for new memories" }).click();
  await expect(page.locator(".scene-arrival")).toContainText(
    "David connected another piece",
  );
  await page
    .getByRole("button", {
      name: "Explore the connection: Nana’s kitchen in Brighton",
    })
    .click();
  await expect(page.locator(".scene-detail")).toContainText(
    "Nana brought the recipe from her home in Brighton",
  );
  await expect(page.locator(".scene-missing")).toHaveClass(/is-complete/);
  expect(await page.locator("audio[autoplay]").count()).toBe(0);
  await page.screenshot({ path: "test-results/story-connected.png" });
});

test("photograph follows the pointer and can reverse before its spring settles", async ({
  page,
}) => {
  await page.route("**/api/family", (r) => r.fulfill({ json: sceneFixture() }));
  await openScene(page);
  const photo = page.locator(".scene-photograph");
  const box = (await photo.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 75, {
    steps: 5,
  });
  const progress = await page
    .locator(".scene-world")
    .evaluate((el) => Number(el.style.getPropertyValue("--unfold")));
  expect(progress).toBeCloseTo(0.5, 1);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 150, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(page.locator(".scene-world")).toHaveClass(/is-unfolded/);
  await photo.click();
  await expect
    .poll(() =>
      page
        .locator(".scene-world")
        .evaluate((el) => el.style.getPropertyValue("--unfold")),
    )
    .toBe("0");
});

test("large text, reduced motion and keyboard alternatives work on a narrow phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() =>
    localStorage.setItem("kin-large-text", "true"),
  );
  const data = sceneFixture();
  data.relativeId = "david";
  await page.route("**/api/family", (r) => r.fulfill({ json: data }));
  await openScene(page);
  await page.locator(".scene-photograph").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".scene-world")).toHaveClass(/is-still/);
  expect(
    await page
      .locator(".scene-world")
      .evaluate((el) => el.style.getPropertyValue("--unfold")),
  ).toBe("1");
  expect(
    await page
      .getByRole("dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.getByRole("button", { name: "Explore the missing piece" }).click();
  await expect(
    page.getByRole("button", { name: "Record the missing piece", exact: true }),
  ).toBeVisible();
  await audit(page);
});

test("touch drag tracks continuously and a reverse drag folds the story", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/api/family", (r) => r.fulfill({ json: sceneFixture() }));
  await openScene(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  const box = (await page.locator(".scene-photograph").boundingBox())!;
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x, y: y - 80 }],
  });
  expect(
    await page
      .locator(".scene-world")
      .evaluate((el) => Number(el.style.getPropertyValue("--unfold"))),
  ).toBeCloseTo(80 / 150, 1);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x, y: y - 150 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.locator(".scene-world")).toHaveClass(/is-unfolded/);
  await expect
    .poll(() =>
      page
        .locator(".scene-world")
        .evaluate((el) => el.style.getPropertyValue("--unfold")),
    )
    .toBe("1");
  const opened = (await page.locator(".scene-photograph").boundingBox())!;
  const start = opened.y + opened.height / 2;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y: start }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x, y: start + 150 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(() =>
      page
        .locator(".scene-world")
        .evaluate((el) => el.style.getPropertyValue("--unfold")),
    )
    .toBe("0");
});

test("original recordings stay opt-in and pause when their perspective is closed", async ({
  page,
}) => {
  const data = sceneFixture();
  data.memories[0].mediaUrl = "/test-original.wav";
  await page.route("**/api/family", (r) => r.fulfill({ json: data }));
  // Two seconds of silent PCM: exercises browser playback without a real family recording.
  const wav = Buffer.alloc(44 + 16000 * 2 * 2);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(wav.length - 44, 40);
  await page.route("**/test-original.wav", (r) =>
    r.fulfill({ body: wav, contentType: "audio/wav" }),
  );
  await openScene(page);
  await page
    .locator(".scene-perspectives")
    .getByRole("button", { name: "M Maya", exact: true })
    .click();
  const audio = page.locator(".scene-detail audio");
  expect(await audio.evaluate((el) => (el as HTMLAudioElement).paused)).toBe(
    true,
  );
  const handle = await audio.elementHandle();
  await audio.evaluate((el) => (el as HTMLAudioElement).play());
  expect(await audio.evaluate((el) => (el as HTMLAudioElement).paused)).toBe(
    false,
  );
  await page.getByRole("button", { name: "Close memory details" }).click();
  expect(await handle!.evaluate((el) => (el as HTMLAudioElement).paused)).toBe(
    true,
  );
});
