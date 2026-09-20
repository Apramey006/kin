import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
for (const route of ["/", "/signin", "/signup", "/forgot-password"]) {
  test(`public ${route} loads accessibly`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: 375, height: 812 });
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator("main")).toBeVisible();
    expect(errors).toEqual([]);
    const a = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      a.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/public-${route.replaceAll("/", "") || "home"}.png`,
      fullPage: true,
    });
  });
}
test("private pages redirect to sign in and unauthenticated APIs reject access", async ({
  page,
  request,
}) => {
  for (const path of [
    "/family",
    "/stage",
    "/wearer",
    "/settings",
    "/onboarding",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/signin\?next=/);
  }
  for (const path of ["/api/family", "/api/account", "/api/recall"])
    expect((await request.get(path)).status()).toBe(401);
  for (const path of [
    "/api/onboarding",
    "/api/invite",
    "/api/memories/photo",
    "/api/memories/story",
    "/api/faces/enroll",
    "/api/tts",
    "/api/weaver/answer",
    "/api/weaver/run",
    "/api/recall",
  ])
    expect((await request.post(path, { data: {} })).status()).toBe(401);
});

test("signup and reset explain email confirmation without sending test emails", async ({
  page,
}) => {
  await page.route("**/auth/v1/signup**", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "test",
          email: "kin@example.invalid",
          identities: [{ id: "test" }],
        },
        session: null,
      },
    }),
  );
  await page.goto("/signup");
  await page.getByLabel("Your name", { exact: true }).fill("Test Member");
  await page.getByLabel("Email address").fill("kin@example.invalid");
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-only-LongPassword1!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Check your email." }),
  ).toBeVisible();
  await page.route("**/auth/v1/recover**", (r) => r.fulfill({ json: {} }));
  await page.goto("/forgot-password");
  await page.getByLabel("Email address").fill("kin@example.invalid");
  await page
    .getByRole("button", { name: "Send reset link", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Check your email." }),
  ).toBeVisible();
});
