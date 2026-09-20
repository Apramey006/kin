import { test, expect } from "@playwright/test";
import { DEMO_ACCOUNTS, DEMO_FAMILY_ID } from "../lib/demo";
import { signInDemo, json } from "./auth-fixture";

for (const account of DEMO_ACCOUNTS) test(`${account.name} opens the correct family experience`, async ({ page }) => {
  await page.route("**/rest/v1/**", route => route.fulfill(json(
    route.request().url().includes("/relatives") ? DEMO_ACCOUNTS.filter(a => a.contributorId).map(a => ({
      id: a.contributorId, family_id: DEMO_FAMILY_ID, name: a.name, relation_to_wearer: "family", color: "#abcdef",
    })) : route.request().url().includes("/wearer") ? { name: "Rosa" } : []
  )));
  await signInDemo(page, account.role === "wearer" ? "/wearer" : "/family", account.role === "organizer", DEMO_FAMILY_ID, account.name);
  if (account.role === "wearer") {
    await expect(page.getByRole("button", { name: "Open camera" })).toBeVisible();
    await page.goto("/family");
    await expect(page).toHaveURL(/\/wearer$/);
    await expect(page.getByText("Add a photo", { exact: true })).toHaveCount(0);
  } else {
    await expect(page.getByRole("heading", { name: "Memories", exact: true })).toBeVisible();
    await page.goto("/settings");
    const tools=page.getByText("Demo tools", {exact:true});
    if(account.role === "organizer") await tools.click();
    const seed = page.getByRole("button", { name: "Add sample memories" });
    if (account.role === "organizer") await expect(seed).toBeEnabled();
    else await expect(seed).toHaveCount(0);
  }
});
