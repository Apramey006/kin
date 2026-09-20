import { test, expect } from "@playwright/test";

const protectedRoutes = ["/stage", "/family", "/wearer", "/settings", "/onboarding"];

for (const route of protectedRoutes) {
  test(`redirects unauthenticated visitors from ${route} to sign in`, async ({ page }) => {
    await page.goto(route);
    await page.waitForURL(/\/signin/);
    const url = new URL(page.url());
    expect(url.pathname).toBe("/signin");
    expect(url.searchParams.get("next")).toBe(route);
  });
}
