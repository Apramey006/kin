import { DEMO_ACCOUNTS, DEMO_FAMILY_ID, DEMO_CONTRIBUTOR_IDS } from "../lib/demo";
import { expect, type Page } from "@playwright/test";

export const memberId = DEMO_CONTRIBUTOR_IDS.maya;
export const family = DEMO_FAMILY_ID;
export const member = { id: memberId, family_id: family, name: "Maya", relation_to_wearer: "granddaughter", color: "#8c6356" };
export const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

/** Browser-only Auth mock. Never contacts or provisions a real account. */
export async function signInDemo(page: Page, path = "/stage", admin = true, familyId = family, accountName = "Maya") {
  const account = DEMO_ACCOUNTS.find(a => a.name === accountName)!;
  const user = { id: "22222222-2222-4222-8222-222222222222", aud: "authenticated", role: "authenticated", email: account.email, app_metadata: { kin_family_id: familyId, kin_contributor_id: account.contributorId, kin_role: account.role, kin_admin: account.role === "organizer" && admin }, user_metadata: {}, created_at: new Date().toISOString() };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" })}.browser-test-only`;
  await page.route("**/auth/v1/**", (route) => route.fulfill(json(route.request().url().includes("/user") ? user : { access_token: token, refresh_token: "browser-test-refresh", token_type: "bearer", expires_in: 3600, user })));
  await page.goto(path);
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("browser-test-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}
