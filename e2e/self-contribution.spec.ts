import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { json, member, signInDemo } from "./auth-fixture";

const SELF_ID = "44444444-4444-4444-8444-444444444444";

test.beforeEach(async ({ page }) => {
  // Registered first so the specific handlers below take precedence.
  await page.route("**/api/**", (route) => route.abort());
  await page.route("**/rest/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill(json(path.endsWith("/relatives") ? [member] : path.endsWith("/wearer") ? { name: "Rosa" } : []));
  });
});

test("the capture surface requires a session", async ({ page }) => {
  await page.goto("/remember");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record a memory" })).toHaveCount(0);
});

test("the wearer records a story against their own keeper", async ({ page }) => {
  let posted: { contributor: boolean; authorized: boolean } | null = null;
  await page.route("**/api/self", (route) =>
    route.fulfill(json({ contributorId: SELF_ID, name: "Rosa", captureOpen: true })));
  await page.route("**/api/memories/story", (route) => {
    posted = {
      contributor: (route.request().postData() ?? "").includes(SELF_ID),
      authorized: /^Bearer /.test(route.request().headers().authorization ?? ""),
    };
    return route.fulfill(json({ transcript: "Nora and I baked lemon cake every Sunday." }));
  });

  await signInDemo(page, "/remember", false, undefined, "Rosa");
  await expect(page.getByRole("heading", { name: "Tell us something." })).toBeVisible();

  // The Recorder needs a real capture; drive the submit path directly instead.
  await page.evaluate(async (selfId) => {
    const fd = new FormData();
    fd.append("file", new File([new Blob(["x"])], "story.webm", { type: "audio/webm" }));
    fd.append("contributor_id", selfId);
    await fetch("/api/memories/story", {
      method: "POST", body: fd,
      headers: { Authorization: "Bearer browser-test-only", "Idempotency-Key": "e2e-self" },
    });
  }, SELF_ID);

  expect(posted).toEqual({ contributor: true, authorized: true });
});

test("a closed window never shows the wearer a door closing", async ({ page }) => {
  await page.route("**/api/self", (route) =>
    route.fulfill(json({ contributorId: SELF_ID, name: "Rosa", captureOpen: false })));

  await signInDemo(page, "/remember", false, undefined, "Rosa");
  // Identical affordance and copy whether or not contributions commit directly.
  await expect(page.getByRole("heading", { name: "Tell us something." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record a memory" })).toBeEnabled();
  await expect(page.getByText(/review|pending|approval|no longer/i)).toHaveCount(0);
});

test("contributors review held stories and can reopen the window", async ({ page }) => {
  const decisions: { id: string; action: string }[] = [];
  let captureOpen = false;
  await page.route("**/api/self/review", (route) => {
    if (route.request().method() === "POST") {
      decisions.push(JSON.parse(route.request().postData() ?? "{}"));
      return route.fulfill(json({ id: "pending-1", state: "approved" }));
    }
    return route.fulfill(json({
      pending: [{ id: "pending-1", kind: "story", preview: "My mother taught me the cake in Kraków.", created_at: new Date().toISOString() }],
    }));
  });
  await page.route("**/api/self/window", (route) => {
    if (route.request().method() === "PATCH") {
      captureOpen = JSON.parse(route.request().postData() ?? "{}").captureOpen;
      return route.fulfill(json({ captureOpen }));
    }
    return route.fulfill(json({ hasSelfKeeper: true, name: "Rosa", captureOpen }));
  });

  await signInDemo(page, "/family", true, undefined, "Maya");

  await expect(page.getByRole("region", { name: "Stories awaiting review" })).toBeVisible();
  await expect(page.getByText(/My mother taught me/)).not.toBeVisible();
  await page.screenshot({ path: "test-results/stories-review-summary.png", fullPage: true });
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("My mother taught me the cake in Kraków.");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Add to our memory" }).click();
  await expect(page.getByText("My mother taught me the cake in Kraków.")).toHaveCount(0);
  expect(decisions).toEqual([{ id: "pending-1", action: "approve" }]);

  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("region", { name: "Stories awaiting review" })).toHaveCount(0);
  await page.goto("/settings");
  const review = page.getByRole("switch", { name: /Review before adding/ });
  await expect(review).toBeChecked();
  await review.click();
  await expect(review).not.toBeChecked();
  expect(captureOpen).toBe(true);
  await review.click();
  await expect(review).toBeChecked();
  expect(captureOpen).toBe(false);
  await page.screenshot({ path: "test-results/recording-settings.png", fullPage: true });
});
