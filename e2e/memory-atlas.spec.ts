import { test, expect } from "@playwright/test";

test("redirects unauthenticated visitors from /graph to sign in", async ({ page }) => {
  await page.goto("/graph");
  await page.waitForURL(/\/signin/);
  const url = new URL(page.url());
  expect(url.pathname).toBe("/signin");
  expect(url.searchParams.get("next")).toBe("/graph");
});

test("preserves the query string in the sign-in redirect", async ({ page }) => {
  await page.goto("/graph?demo=1");
  await page.waitForURL(/\/signin/);
  const url = new URL(page.url());
  expect(url.pathname).toBe("/signin");
  expect(url.searchParams.get("next")).toBe("/graph?demo=1");
});
