import { test, expect } from "@playwright/test";
import { json, member, signInDemo } from "./auth-fixture";

const nora = { id: "33333333-3333-4333-8333-333333333333", family_id: "670f5075-c286-4b29-8074-86401c18d0c0", type: "person", label: "Nora", relation_to_wearer: "sister", aliases: [] };
// Non-biometric one-pixel test image, only sent to mocked browser routes.
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1kAAAAASUVORK5CYII=", "base64");

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort());
  await page.route("**/rest/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill(json(path.endsWith("/relatives") ? [member] : path.endsWith("/graph_nodes") ? [nora] : path.endsWith("/wearer") ? { name: "Rosa" } : []));
  });
});

test("protected mobile views require a session", async ({ page }) => {
  for (const path of ["/family", "/wearer", "/stage", "/graph"]) {
    await page.goto(path);
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Who is this?" })).toHaveCount(0);
  }
});

test("photo preserves original bytes, requires explicit labels, and retries failed enrollment", async ({ page }) => {
  let detectedBytes: Buffer | null = null;
  const keys: string[] = [];
  let enrollments = 0;
  await page.route("**/api/faces/detect", (route) => {
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    detectedBytes = route.request().postDataBuffer();
    expect(detectedBytes?.includes(png)).toBe(true);
    return route.fulfill(json({ faces: [{ temporaryFaceId: "sealed-test-selection", box: { x: 0, y: 0, width: 1, height: 1 } }] }));
  });
  await page.route("**/api/memories/photo", (route) => {
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    expect(route.request().postDataBuffer()?.includes(png)).toBe(true);
    expect(route.request().postData()).toContain(nora.id);
    keys.push(route.request().headers()["idempotency-key"]);
    return route.fulfill(json({ memory_id: "memory-test", persons: [{ index: 0, node_id: nora.id }] }));
  });
  await page.route("**/api/faces/enroll", (route) => {
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({ temporaryFaceId: "sealed-test-selection", consent: true, person_node_id: nora.id });
    expect(body).not.toHaveProperty("descriptor");
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    return route.fulfill(++enrollments === 1 ? json({ error: "Face service unavailable" }, 502) : json({ ok: true }));
  });
  await signInDemo(page, "/family");
  await page.getByRole("button",{name:"Add a memory",exact:true}).click();
  await page.getByRole("button",{name:/A photo/}).click();
  await page.getByLabel("Choose a photo").setInputFiles({ name: "test.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("combobox",{name:"Who is this?"})).toHaveValue("");
  await page.getByRole("combobox",{name:"Who is this?"}).selectOption(nora.id);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Save photo" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("recognition setup did not finish");
  await expect(page.getByText("Your photo is now part of your family’s memories.")).toHaveCount(0);
  await page.getByRole("button", { name: "Save photo" }).click();
  await expect(page.getByText("Your photo is now part of your family’s memories.")).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
});

test("wearer uploads snapshots only and clears the prior cue on SILENT", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { get: () => 16 });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { get: () => 16 });
    HTMLCanvasElement.prototype.toBlob = function (callback) { callback(new Blob(["mock-image-only"], { type: "image/jpeg" })); };
    HTMLMediaElement.prototype.play = async function () {};
    CanvasRenderingContext2D.prototype.drawImage = function () {};
    navigator.mediaDevices.getUserMedia = async () => new MediaStream();
  });
  let calls = 0;
  await page.route("**/api/recall", (route) => {
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    expect(route.request().postData()).toContain('name="snapshot"');
    expect(route.request().postData()).not.toContain("faceDescriptors");
    return route.fulfill(json(++calls === 1 ? { decision: "speak", cueText: "Nora baked lemon cake on Sundays.", audio: null } : { decision: "silent", reasonCode: "unknown_face" }));
  });
  await signInDemo(page, "/wearer");
  await expect(page.getByText("For Rosa", { exact: true })).toBeVisible();
  await page.getByRole("button",{name:"Open camera",exact:true}).click();
  await page.getByRole("button", { name: "Who is this?" }).click();
  await expect(page.getByText("Nora baked lemon cake on Sundays.").filter({ visible: true }).last()).toBeVisible();
  await page.getByRole("button", { name: "Who is this?" }).click();
  await expect(page.getByText("Nora baked lemon cake on Sundays.")).toHaveCount(0);
  await expect.poll(() => calls).toBe(2);
});

test("stage terminal SILENT overrides a stale speak gate", async ({ page }) => {
  await signInDemo(page);
  await page.route("**/api/family", route=>route.fulfill(json({familyId:member.family_id,relativeId:member.id,isOwner:true,email:"test@example.invalid",role:"contributor",
    wearer:{family_id:member.family_id,name:"Rosa"},relatives:[member],memories:[],nodes:[nora],edges:[],provenance:[],questions:[],faces:[],
    events:[{id:"event",status:"silent",gate:{decision:"speak",V:1,R:1,A:1,S:1,X:0,C:.95,threshold:.85},cue_text:"Old unsafe cue",silence_reason:"Grounding failed",latency_ms:80}]})));
  await page.goto("/stage");
  await expect(page.getByRole("heading",{name:"No clear match"})).toBeVisible();
  await expect(page.getByText("Old unsafe cue")).toHaveCount(0);
});
