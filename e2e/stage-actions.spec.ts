import { test, expect, type Page } from "./offline-test";
import { signInDemo } from "./auth-fixture";

const json = (body: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort());
  await page.route("**/rest/v1/**", (route) => route.fulfill(json([])));
  await signInDemo(page);
});

const alertMsg = (page: Page) => page.locator('p[role="alert"]');
const statusMsg = (page: Page) => page.locator('p[role="status"]');
const seedButton = (page: Page) => page.getByRole("button", { name: /^Seed|Seeding/ });
const resetButton = (page: Page) =>
  page.getByRole("button", { name: /^Reset|Resetting/ });
const replayButton = (page: Page) =>
  page.getByRole("button", { name: /Replay|Replaying/ });
const weaverButton = (page: Page) =>
  page.getByRole("button", { name: /Weaver|Weaving/ });

test("JSON failure then retry succeeds", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/admin/seed", (route) => {
    calls += 1;
    return route.fulfill(
      calls === 1 ? json({ error: "Seed unavailable" }, 500) : json({ ok: true })
    );
  });
  await page.goto("/stage");

  await seedButton(page).click();
  await expect(alertMsg(page)).toHaveText("Seed unavailable");
  await expect(seedButton(page)).toBeEnabled();

  await seedButton(page).click();
  await expect(alertMsg(page)).toHaveCount(0);
  await expect(statusMsg(page)).toHaveText("Action completed.");
  expect(calls).toBe(2);
});

test("non-JSON 502 shows generic message, not raw HTML", async ({ page }) => {
  await page.route("**/api/admin/seed", (route) =>
    route.fulfill({ status: 502, contentType: "text/html", body: "<html>Bad Gateway</html>" })
  );
  await page.goto("/stage");

  await seedButton(page).click();
  await expect(alertMsg(page)).toHaveText(
    "Request failed (502). Please try again."
  );
  await expect(seedButton(page)).toBeEnabled();
});

test("network failure shows error without uncaught pageerror", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto("/stage");

  await seedButton(page).click();
  await expect(alertMsg(page)).toBeVisible();
  expect(pageErrors).toEqual([]);
  await expect(seedButton(page)).toBeEnabled();
});

test("pending action locks all controls until settled", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((res) => (release = res));
  let calls = 0;
  await page.route("**/api/admin/seed", async (route) => {
    calls += 1;
    await gate;
    await route.fulfill(json({ ok: true }));
  });
  await page.goto("/stage");

  try {
    await seedButton(page).click();
    await expect.poll(() => calls).toBe(1);
    await expect(seedButton(page)).toHaveText("Seeding…");
    await expect(seedButton(page)).toBeDisabled();
    await expect(resetButton(page)).toBeDisabled();
    await expect(replayButton(page)).toBeDisabled();
    if (await weaverButton(page).count()) {
      await expect(weaverButton(page)).toBeDisabled();
    }

    await seedButton(page).dispatchEvent("click");
    expect(calls).toBe(1);
  } finally {
    release();
  }

  await expect(statusMsg(page)).toHaveText("Action completed.");
  await expect(seedButton(page)).toBeEnabled();
  await expect(resetButton(page)).toBeEnabled();
  await expect(replayButton(page)).toBeEnabled();
  if (await weaverButton(page).count()) {
    await expect(weaverButton(page)).toBeEnabled();
  }
});

test("reset requires confirmation", async ({ page }) => {
  let calls = 0;
  const dialogs: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    d.dismiss();
  });
  await page.route("**/api/admin/reset", (route) => {
    calls += 1;
    return route.fulfill(json({ ok: true }));
  });
  await page.goto("/stage");

  await resetButton(page).click();
  await expect.poll(() => dialogs.length).toBe(1);
  expect(calls).toBe(0);
  await expect(resetButton(page)).toBeEnabled();

  page.removeAllListeners("dialog");
  page.once("dialog", (d) => {
    dialogs.push(d.message());
    d.accept();
  });
  await resetButton(page).click();
  await expect.poll(() => dialogs.length).toBe(2);
  await expect(statusMsg(page)).toHaveText("Action completed.");
  expect(calls).toBe(1);
});

test("replay surfaces GET failure and skips POST", async ({ page }) => {
  let posts = 0;
  await page.route("**/api/recall", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill(json({ error: "Recall unavailable" }, 500));
    }
    posts += 1;
    return route.fulfill(json({ ok: true }));
  });
  await page.goto("/stage");

  await replayButton(page).click();
  await expect(alertMsg(page)).toHaveText("Recall unavailable");
  expect(posts).toBe(0);
});

test("replay with no prior recall shows feedback and skips POST", async ({ page }) => {
  let posts = 0;
  await page.route("**/api/recall", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill(json({ lastEventId: null }));
    }
    posts += 1;
    return route.fulfill(json({ ok: true }));
  });
  await page.goto("/stage");

  await replayButton(page).click();
  await expect(alertMsg(page)).toHaveText(
    "No recall to replay yet. Try a recall from the wearer screen first."
  );
  expect(posts).toBe(0);
});

test("replay success posts the last event id", async ({ page }) => {
  let gets = 0;
  let posts = 0;
  await page.route("**/api/recall", (route) => {
    const req = route.request();
    if (req.method() === "GET") {
      gets += 1;
      return route.fulfill(json({ lastEventId: "event-123" }));
    }
    posts += 1;
    expect(req.postDataJSON()).toEqual({ replayEventId: "event-123" });
    return route.fulfill(json({ ok: true }));
  });
  await page.goto("/stage");

  await replayButton(page).click();
  await expect(statusMsg(page)).toHaveText("Action completed.");
  expect(gets).toBe(1);
  expect(posts).toBe(1);
});

test("replay POST failure shows error and re-enables controls", async ({ page }) => {
  await page.route("**/api/recall", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill(json({ lastEventId: "event-123" }));
    }
    return route.fulfill(json({ error: "Replay failed upstream" }, 500));
  });
  await page.goto("/stage");

  await replayButton(page).click();
  await expect(alertMsg(page)).toHaveText("Replay failed upstream");
  await expect(replayButton(page)).toBeEnabled();
  await expect(seedButton(page)).toBeEnabled();
});
