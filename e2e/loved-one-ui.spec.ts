import { test, expect, familyFixture } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
const token = "44444444-4444-4444-8444-444444444444";
test("organizer has a distinct invitation for Rosa", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/api/family", (r) =>
    r.fulfill({ json: familyFixture() }),
  );
  await page.route("**/api/invite", (r) => {
    expect(r.request().postDataJSON()).toEqual({ role: "loved_one" });
    return r.fulfill({ json: { token, role: "loved_one" } });
  });
  await page.goto("/settings");
  await page.getByRole("button", { name: "Invite Rosa", exact: true }).click();
  await expect(
    page.getByLabel("Invitation for Rosa", { exact: true }),
  ).toContainText(`/onboarding?invite=${token}`);
  await expect(
    page.getByRole("button", { name: "Copy Rosa’s invitation", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/it can be used once/)).toBeVisible();
  const a = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(a.violations).toEqual([]);
  await page.screenshot({
    path: "test-results/invite-rosa-mobile.png",
    fullPage: true,
  });
});
test("Rosa accepts the intended invitation without contributor onboarding", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/api/account", (r) =>
    r.fulfill({ json: { membership: null, name: "Rosa" } }),
  );
  await page.route("**/api/invite?*", (r) =>
    r.fulfill({ json: { role: "loved_one", lovedOne: "Rosa" } }),
  );
  const data = familyFixture();
  data.role = "loved_one";
  data.relativeId = null;
  data.isOwner = false;
  await page.route("**/api/family", (r) => r.fulfill({ json: data }));
  await page.route("**/api/onboarding", (r) => {
    expect(r.request().postDataJSON()).toEqual({ mode: "join", invite: token });
    return r.fulfill({ json: { destination: "/wearer" } });
  });
  await page.goto(`/onboarding?invite=${token}`);
  await expect(
    page.getByRole("heading", { name: "Welcome, Rosa." }),
  ).toBeVisible();
  await expect(page.getByLabel(/relationship/)).toHaveCount(0);
  const a = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(a.violations).toEqual([]);
  await page.screenshot({
    path: "test-results/rosa-onboarding-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Join and open Kin" }).click();
  await expect(page).toHaveURL(/\/wearer$/);
  await expect(page.getByRole("link", { name: "Your settings" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to family memories" }),
  ).toHaveCount(0);
});
