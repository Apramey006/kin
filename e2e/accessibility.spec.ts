import AxeBuilder from "@axe-core/playwright";
import { test, expect, familyFixture, personId, relativeId } from "./fixtures";
import type { Page } from "@playwright/test";
async function accessible(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
for (const width of [375, 1440]) {
  test(`family, stage, account and camera are accessible at ${width}px`, async ({
    page,
  }) => {
    const data = familyFixture();
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/family", (r) => r.fulfill({ json: data }));
    for (const path of ["/family", "/stage", "/settings", "/wearer"]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.locator(".skeleton")).toHaveCount(0);
      await accessible(page);
      await page.screenshot({
        path: `test-results/${path.slice(1)}-${width}.png`,
        fullPage: true,
      });
    }
    await page.goto("/family");
    await page
      .getByRole("button", { name: "Add a memory", exact: true })
      .click();
    await accessible(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add a memory", exact: true }),
    ).toBeFocused();
  });
}
test("populated stage explains the memory and provides a readable connection list", async ({
  page,
}) => {
  const data = familyFixture();
  data.nodes.push(
    {
      id: "nora",
      family_id: data.familyId,
      label: "Nora",
      type: "person",
      aliases: [],
      relation_to_wearer: "sister",
    },
    {
      id: "cake",
      family_id: data.familyId,
      label: "Sunday lemon cake",
      type: "tradition",
      aliases: [],
      relation_to_wearer: null,
    },
  );
  data.edges = [
    {
      id: "edge1",
      family_id: data.familyId,
      from_node: "nora",
      rel: "sister_of",
      to_node: personId,
    },
    {
      id: "edge2",
      family_id: data.familyId,
      from_node: "nora",
      rel: "enjoys",
      to_node: "cake",
    },
  ];
  data.events = [
    {
      id: "event",
      family_id: data.familyId,
      status: "speak",
      snapshot_path: null,
      face_descriptors: null,
      latency_ms: 2100,
      silence_reason: null,
      created_at: new Date().toISOString(),
      cue_text:
        "That’s Nora, your sister. Maya remembers: Nora always wore a yellow apron.",
      cue_source: {
        memoryId: "memory",
        contributorName: "Maya",
        quote: "Nora always wore a yellow apron.",
      },
      keeper_results: [
        {
          keeperId: relativeId,
          claim: { subjectNodeId: "nora", label: "Nora" },
          memoryIds: ["memory"],
          v: 1,
          r: 1,
          reason: "Matched family photo",
          evidence: [
            {
              id: "memory",
              summary: "Nora and Rosa baked lemon cake every Sunday.",
            },
          ],
        },
      ],
      gate: {
        V: 1,
        R: 1,
        A: 1,
        S: 1,
        X: 0,
        C: 0.95,
        threshold: 0.8,
        decision: "speak",
        reason: "Matched",
        subjectNodeId: "nora",
        agreeingKeeperIds: [relativeId],
        citedMemoryIds: ["memory"],
      },
    },
  ];
  await page.route("**/api/family", (r) => r.fulfill({ json: data }));
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/stage");
    await expect(
      page.getByRole("heading", { name: "Nora", exact: true }),
    ).toBeVisible();
    await accessible(page);
    await page.screenshot({
      path: `test-results/stage-populated-${width}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("button", { name: "Show connection list", exact: true })
    .click();
  await expect(page.getByText("Sunday lemon cake").first()).toBeVisible();
});
test("recording stops into a preview and never uploads until Save memory", async ({
  page,
}) => {
  await page.route("**/api/family", (r) =>
    r.fulfill({ json: familyFixture() }),
  );
  let saves = 0;
  await page.route("**/api/memories/story", async (r) => {
    saves++;
    await r.fulfill({
      status: 500,
      json: { error: "Please try saving again." },
    });
  });
  await page.goto("/family");
  await page.getByRole("button", { name: "Add a memory", exact: true }).click();
  await page.getByRole("button", { name: /A voice memory/ }).click();
  await page
    .getByRole("button", { name: "Record a memory", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Stop recording" }),
  ).toBeVisible();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.locator("audio")).toBeVisible();
  expect(saves).toBe(0);
  await accessible(page);
  await page.getByRole("button", { name: "Save memory", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Please try saving again",
  );
  await expect(page.locator("audio")).toBeVisible();
  expect(saves).toBe(1);
});
test("large text stays usable on a narrow phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.addInitScript(() =>
    localStorage.setItem("kin-large-text", "true"),
  );
  await page.route("**/api/family", (r) =>
    r.fulfill({ json: familyFixture() }),
  );
  await page.goto("/family");
  await expect(page.locator("h1")).toBeVisible();
  await accessible(page);
});

test("mobile sheet tracks a drag, returns on reversal, and dismisses on a downward flick", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/api/family", (r) =>
    r.fulfill({ json: familyFixture() }),
  );
  await page.goto("/family");
  await page.getByRole("button", { name: "Add a memory", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect
    .poll(() =>
      dialog.evaluate((e) =>
        Math.abs(new DOMMatrix(getComputedStyle(e).transform).m42),
      ),
    )
    .toBeLessThan(1);
  const header = await dialog.locator(".sheet-head").boundingBox();
  if (!header) throw new Error("Missing sheet header");
  const x = header.x + 80,
    y = header.y + 12;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 90, { steps: 5 });
  expect(
    await dialog.evaluate(
      (e) => new DOMMatrix(getComputedStyle(e).transform).m42,
    ),
  ).toBeGreaterThan(85);
  await page.mouse.move(x, y + 12, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(() =>
      dialog.evaluate((e) =>
        Math.abs(new DOMMatrix(getComputedStyle(e).transform).m42),
      ),
    )
    .toBeLessThan(1);
  await expect(dialog).toBeVisible();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 210, { steps: 6 });
  await page.mouse.up();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add a memory", exact: true }),
  ).toBeFocused();
});
test("reduced motion uses a stationary sheet and Escape restores focus", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/api/family", (r) =>
    r.fulfill({ json: familyFixture() }),
  );
  await page.goto("/family");
  const add = page.getByRole("button", { name: "Add a memory", exact: true });
  await add.click();
  await expect(page.getByRole("dialog")).toHaveCSS("transform", "none");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(add).toBeFocused();
});

test("200 percent text reflows on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/api/family", (r) =>
    r.fulfill({ json: familyFixture() }),
  );
  for (const route of ["/family", "/stage", "/settings", "/wearer"]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    await page.addStyleTag({ content: ":root{font-size:34px!important}" });
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll("main *")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.width &&
            r.right > innerWidth + 1 &&
            getComputedStyle(el).position !== "absolute"
          );
        })
        .map((el) => ({ tag: el.tagName, class: el.className })),
    );
    expect(overflow).toEqual([]);
  }
});
