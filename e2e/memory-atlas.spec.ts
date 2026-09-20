import { test, expect } from "@playwright/test";
import { signInDemo } from "./auth-fixture";

test("live Atlas uses signed-in family scope and clears on sign out", async ({ page }) => {
  const families: string[] = [];
  await page.route("**/rest/v1/**", route => {
    families.push(new URL(route.request().url()).searchParams.get("family_id") ?? "");
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await signInDemo(page, "/graph", false, "another-family");
  await expect(page.getByText("Connected to your family", { exact: true })).toBeVisible();
  expect(families.length).toBeGreaterThanOrEqual(4);
  expect(families.every(f => f === "eq.another-family")).toBe(true);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Interactive family graph" })).toHaveCount(0);
});

test("explores entities, relationship evidence, and memory trails", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1040 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/graph?demo=1");
  await expect(page.getByRole("heading", { name: "Every memory connects us." })).toBeVisible();
  await expect(page.getByText("An illustrative family story.", { exact: false })).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(9);
  await page.screenshot({ path: testInfo.outputPath("atlas-desktop.png"), fullPage: true, animations: "disabled" });
  await page.locator('.react-flow__node[data-id="nora"]').click();
  const details = page.getByRole("complementary", { name: "Connection details" });
  await expect(details.getByRole("heading", { name: "Nora", exact: true })).toBeVisible();
  await expect(details.getByText("REMEMBERED BY YOUR FAMILY")).toBeVisible();
  await page.getByRole("button", { name: "Clear selection" }).click();
  await page.getByRole("button", { name: "Explore relationship: comes from", exact: true }).click();
  await expect(details.getByRole("heading", { name: "Sunday lemon cake → Italy" })).toBeVisible();
  await page.getByRole("button", { name: "Memory trails", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(14);
  await page.getByRole("button", { name: "Explore memory 4 from David" }).click();
  await expect(details.getByRole("heading", { name: "David remembers" })).toBeVisible();
  await expect(details.getByText("Lucia", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("plays memory formation and returns to the full graph", async ({ page }) => {
  await page.goto("/graph?demo=1");
  await expect(page.locator(".react-flow__node")).toHaveCount(9);
  await page.getByRole("button", { name: "Play memory formation" }).click();
  await expect(page.getByRole("slider", { name: "Memory timeline" })).toHaveValue("1");
  await page.getByRole("button", { name: "Pause memory playback" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await expect(page.locator('.react-flow__node[data-id="mother"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Return to present" }).click();
  await expect(page.getByRole("slider", { name: "Memory timeline" })).toHaveValue("5");
  await expect(page.locator(".react-flow__node")).toHaveCount(9);
});

test("search and type filters remain keyboard accessible", async ({ page }) => {
  await page.goto("/graph?demo=1");
  await page.getByRole("textbox", { name: "Find an entity" }).fill("Nora");
  await expect(page.getByRole("textbox", { name: "Find an entity" })).toHaveValue("Nora");
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.getByRole("button", { name: "Places", exact: true }).click();
  await expect(page.getByRole("button", { name: "Places", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Show all entity types" }).click();
  const rosa = page.getByRole("button", { name: "Explore Rosa", exact: true });
  await rosa.focus();
  await expect(rosa).toBeFocused();
  await rosa.press("Enter");
  await expect(page.getByRole("complementary", { name: "Connection details" }).getByRole("heading", { name: "Rosa", exact: true })).toBeVisible();
});

test("fits a phone viewport without horizontal overflow", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/graph?demo=1");
  await expect(page.getByRole("button", { name: "Play memory formation" })).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(9);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("atlas-mobile.png"), fullPage: true, animations: "disabled" });
});

test("does not silently replace a failed family connection with sample data", async ({ page }) => {
  await page.route("**/rest/v1/**", (route) => route.fulfill({ status: 503, body: "unavailable" }));
  await signInDemo(page, "/graph");
  await expect(page.getByText("We couldn’t connect to your family’s memories.", { exact: false })).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(0);
  await page.getByRole("button", { name: "Explore the sample", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(9);
});
