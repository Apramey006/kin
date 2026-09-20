import { test, expect, familyFixture, relativeId, memoryId } from "./fixtures";
test("deleting your memory requires confirmation, preserves it on failure, and supports retry", async ({
  page,
}) => {
  const data = familyFixture();
  const summary = "A disposable browser test memory.";
  data.memories = [
    {
      id: memoryId,
      family_id: data.familyId,
      contributor_id: relativeId,
      kind: "photo",
      summary,
      caption: summary,
      transcript: null,
      media_path: null,
      mediaUrl: null,
      source_question_id: null,
      created_at: new Date().toISOString(),
    },
  ];
  await page.route("**/api/family", (r) => r.fulfill({ json: data }));
  let calls = 0;
  await page.route("**/api/memories/*", async (r) => {
    expect(r.request().method()).toBe("DELETE");
    expect(new URL(r.request().url()).searchParams.get("contributor_id")).toBe(
      relativeId,
    );
    calls++;
    if (calls === 1)
      await r.fulfill({
        status: 500,
        json: { error: "Could not delete this memory. Please try again." },
      });
    else {
      data.memories = [];
      await r.fulfill({ json: { ok: true } });
    }
  });
  await page.goto("/family");
  const remove = page.getByRole("button", {
    name: `Delete memory: ${summary}`,
    exact: true,
  });
  await remove.click();
  await page.getByRole("button", { name: "Keep memory", exact: true }).click();
  expect(calls).toBe(0);
  await expect(remove).toBeFocused();
  await remove.click();
  await page
    .getByRole("button", { name: "Delete memory", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Please try again",
  );
  await expect(page.getByText(summary, { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Delete memory", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Memory and its upload deleted.",
  );
  await expect(page.getByText(summary, { exact: true })).toHaveCount(0);
  expect(calls).toBe(2);
});
