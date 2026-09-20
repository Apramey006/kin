import AxeBuilder from "@axe-core/playwright";
import { test, expect, familyFixture, relativeId } from "./fixtures";
import type { Page } from "@playwright/test";
import type { FamilyData } from "../lib/family-data";

const topicId = "44444444-4444-4444-8444-444444444444";
const firstId = "55555555-5555-4555-8555-555555555555";
const secondId = "66666666-6666-4666-8666-666666666666";
const addedId = "77777777-7777-4777-8777-777777777777";

function addMemory(data: FamilyData, id: string, owner = relativeId) {
  data.memories.push({ id, family_id: data.familyId, contributor_id: owner, kind: "story", media_path: `${id}.wav`, mediaUrl: "/story-audio.wav", transcript: "We baked lemon cake on Sundays.", summary: "A memory of baking lemon cake together.", caption: null, source_question_id: null, created_at: `2026-01-0${data.memories.length + 1}T12:00:00Z` });
  data.provenance.push({ id: `p-${id}`, memory_id: id, contributor_id: owner, node_id: topicId, edge_id: null });
}
function storyFixture() {
  const data = familyFixture();
  data.nodes.push({ id: topicId, family_id: data.familyId, label: "Sunday lemon cake", type: "tradition", aliases: [], relation_to_wearer: null });
  data.relatives.push({ ...data.relatives[0], id: "elena", name: "Elena" });
  addMemory(data, firstId);
  addMemory(data, secondId, "elena");
  return data;
}
function wav() {
  const bytes = Buffer.alloc(44 + 8000 * 2 * 4);
  bytes.write("RIFF"); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
}
async function mount(page: Page, data: FamilyData) {
  await page.route("**/api/family", (route) => route.fulfill({ json: data }));
  await page.route("**/story-audio.wav", (route) => route.fulfill({ contentType: "audio/wav", body: wav() }));
  await page.route("**/api/stories/*", (route) => {
    const memory = data.memories.find((m) => m.id === route.request().url().split("/").pop());
    return memory ? route.fulfill({ json: { id: memory.id, transcript: memory.transcript, mediaUrl: "/story-audio.wav", segments: [{ start: 0.5, end: 3, text: memory.transcript }] } }) : route.fulfill({ status: 404, json: { error: "This memory is no longer available." } });
  });
  await page.goto(`/stories?topic=${topicId}`);
  await expect(page.getByRole("heading", { name: "Sunday lemon cake", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play chapter", exact: true })).toBeEnabled();
}
const refresh = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

for (const width of [375, 1440]) {
  test(`story discovery, sources and listening view are accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await mount(page, storyFixture());
    const a11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(a11y.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/living-story-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Open original memory" }).click();
    await expect(page.getByRole("dialog")).toContainText("We baked lemon cake on Sundays.");
    await expect(page.getByLabel("Full original recording from Maya")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByRole("link", { name: "All stories" }).click();
    await expect(page.getByRole("heading", { name: "Stories to spend time with" })).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `test-results/living-stories-${width}.png`, fullPage: true });
    await page.getByRole("link", { name: /Sunday lemon cake/ }).click();
    await expect(page.getByRole("button", { name: "Play chapter", exact: true })).toBeEnabled();
  });
}

test("plays original excerpts, pauses, advances, and stops at the end", async ({ page }) => {
  await mount(page, storyFixture());
  const recording = page.locator('section[aria-label="Story player"] audio').first();
  await page.getByRole("button", { name: "Play chapter", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause chapter" })).toBeVisible();
  await expect.poll(() => recording.evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBeGreaterThanOrEqual(0.5);
  await page.getByRole("button", { name: "Pause chapter" }).click();
  expect(await recording.evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(true);
  await page.getByRole("button", { name: "Play chapter", exact: true }).click();
  await recording.evaluate((audio: HTMLAudioElement) => { audio.currentTime = 2.95; });
  await expect(page.getByText("Elena’s recording · excerpt")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause chapter" })).toBeVisible();
  await recording.evaluate((audio: HTMLAudioElement) => { audio.currentTime = 2.95; });
  await expect(page.getByText("You’ve heard every chapter")).toBeVisible();
  expect(await recording.evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(true);
});

test("offers new chapters without interrupting, then removes a deleted recording", async ({ page }) => {
  const data = storyFixture();
  await mount(page, data);
  addMemory(data, addedId, "elena");
  await refresh(page);
  await expect(page.getByText("Elena added to the story.")).toBeVisible();
  await expect(page.getByText("Maya’s recording · excerpt")).toBeVisible();
  await page.getByRole("button", { name: "Hear what’s new" }).click();
  await expect(page.getByText("Elena’s recording · excerpt")).toBeVisible();
  await page.getByRole("button", { name: "Play chapter", exact: true }).click();
  data.memories = data.memories.filter((m) => m.id !== addedId);
  await refresh(page);
  await expect(page.getByText("Maya’s recording · excerpt")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause chapter" })).toHaveCount(0);
});

test("records, previews, saves and links a new contribution to the selected topic", async ({ page }) => {
  await page.context().grantPermissions(["microphone"]);
  const data = storyFixture();
  let saved = false;
  await page.route("**/api/memories/story", async (route) => {
    expect(route.request().postDataBuffer()?.toString()).toContain(topicId);
    saved = true; addMemory(data, addedId);
    await route.fulfill({ json: { memory_id: addedId } });
  });
  await mount(page, data);
  await page.getByRole("button", { name: "Add your part" }).click();
  await page.getByRole("button", { name: "Record your part", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.getByLabel("Preview your recording")).toBeVisible();
  expect(saved).toBe(false);
  await page.getByRole("button", { name: "Save memory", exact: true }).click();
  await expect(page.getByText("Maya added to the story.")).toBeVisible();
  expect(saved).toBe(true);
});

test("loved-one accounts start in quiet view and cannot contribute", async ({ page }) => {
  const data = storyFixture(); data.role = "loved_one"; data.relativeId = null;
  await mount(page, data);
  await expect(page.getByRole("button", { name: "Quiet view" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("complementary", { name: "Story chapters" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add your part" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Find a missing piece" })).toHaveCount(0);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Elena’s recording · excerpt")).toBeVisible();
});

test("unavailable source audio can be retried and legacy recordings play in full", async ({ page }) => {
  await mount(page, storyFixture());
  let unavailable = true;
  await page.route(`**/api/stories/${secondId}`, (route) => unavailable
    ? route.fulfill({ status: 404, json: { error: "This recording is unavailable." } })
    : route.fulfill({ json: { transcript: "We baked lemon cake on Sundays.", mediaUrl: "/story-audio.wav", segments: [] } }));
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This recording is unavailable." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play chapter", exact: true })).toBeDisabled();
  unavailable = false;
  await page.getByRole("button", { name: "Reload recording" }).click();
  await expect(page.getByText("Elena’s original recording")).toBeVisible();
  await page.getByRole("button", { name: "Play chapter", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause chapter" })).toBeVisible();
});

test("asks Weaver about the current topic and exposes the recipient's question", async ({ page }) => {
  const data = storyFixture();
  await page.route("**/api/weaver/run?*", async (route) => {
    expect(new URL(route.request().url()).searchParams.get("topic")).toBe(topicId);
    const question = { id: "question", family_id: data.familyId, target_relative_id: relativeId, gap_node_id: topicId,
      gap_type: "missing_origin", question_text: "Where did the lemon cake recipe come from?", evidence: [],
      status: "open" as const, answer_memory_id: null, created_at: "2026-01-04T12:00:00Z" };
    data.questions.push(question);
    await route.fulfill({ json: { question } });
  });
  await mount(page, data);
  await page.getByRole("button", { name: "Find a missing piece" }).click();
  await expect(page.getByText("Where did the lemon cake recipe come from?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Play chapter", exact: true }).click();
  await page.getByRole("button", { name: "Share what you remember" }).click();
  await expect(page.getByRole("dialog", { name: "Record an answer" })).toBeVisible();
  expect(await page.locator('section[aria-label="Story player"] audio').first().evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(true);
});
