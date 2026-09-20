import { randomBytes } from "node:crypto";
import { expect, it, vi } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { provisionDemoAccounts } from "../lib/demo-provision";
import { DEMO_ACCOUNTS, DEMO_FAMILY_ID } from "../lib/demo";

function database(initial: User[] = []) {
  const users = [...initial];
  const tables: Record<string, Record<string, unknown>[]> = {};
  const createUser = vi.fn(async (values) => {
    const user = { id: `auth-${users.length}`, email: values.email, app_metadata: values.app_metadata } as User;
    users.push(user); return { data: { user }, error: null };
  });
  const updateUserById = vi.fn(async (id, values) => {
    const user = users.find(u => u.id === id)!;
    Object.assign(user, values); return { data: { user }, error: null };
  });
  const sb = { auth: { admin: { createUser, updateUserById,
    listUsers: async () => ({ data: { users }, error: null }),
  } }, from: (table: string) => {
    tables[table] ??= [];
    return {
      upsert: async (input: Record<string, unknown> | Record<string, unknown>[]) => {
        for (const row of Array.isArray(input) ? input : [input]) {
          const key = (r: Record<string, unknown>) => r.id ?? r.user_id ?? r.family_id;
          if (!tables[table].some(r => key(r) === key(row))) tables[table].push(row);
        }
        return { error: null };
      },
      select: () => ({ eq: async (key: string, value: unknown) => ({ data: tables[table].filter(r => r[key] === value), error: null }) }),
    };
  } } as unknown as SupabaseClient;
  return { sb, users, tables, createUser, updateUserById };
}

it("bootstraps an empty project and reuses all four users on retry without changing passwords", async () => {
  const db = database();
  const password = randomBytes(24).toString("base64url");
  await provisionDemoAccounts(db.sb, password);
  expect(db.createUser).toHaveBeenCalledTimes(4);
  expect(db.tables.relatives).toHaveLength(4);
  expect(db.tables.relatives.filter(r => r.is_self)).toEqual([
    expect.objectContaining({ name: "Rosa", family_id: DEMO_FAMILY_ID, relation_to_wearer: "self" }),
  ]);
  expect(db.tables.wearer).toEqual([{ family_id: DEMO_FAMILY_ID, name: "Rosa" }]);
  for (const account of DEMO_ACCOUNTS) {
    const user = db.users.find(u => u.email === account.email)!;
    expect(user.app_metadata).toMatchObject({ kin_family_id: DEMO_FAMILY_ID, kin_role: account.role,
      kin_contributor_id: account.contributorId, kin_admin: account.role === "organizer" });
  }
  const rosa = db.users.find(u => u.email === DEMO_ACCOUNTS[3].email)!;
  expect(db.tables.wearer_accounts).toEqual([{ user_id: rosa.id, family_id: DEMO_FAMILY_ID }]);
  const ids = db.users.map(u => u.id);
  const selfId = db.tables.relatives.find(r => r.is_self)!.id;
  await provisionDemoAccounts(db.sb, password);
  expect(db.createUser).toHaveBeenCalledTimes(4);
  expect(db.updateUserById).toHaveBeenCalledTimes(4);
  expect(db.users.map(u => u.id)).toEqual(ids);
  expect(db.tables.relatives).toHaveLength(4);
  expect(db.tables.relatives.find(r => r.is_self)!.id).toBe(selfId);
  expect(db.tables.wearer_accounts).toHaveLength(1);
  for (const [, update] of db.updateUserById.mock.calls) expect(update).not.toHaveProperty("password");
});

it("reuses an existing self Keeper and preserves its closed window", async () => {
  const db = database();
  db.tables.relatives = [{ id: "existing-self", family_id: DEMO_FAMILY_ID, name: "Rosa", is_self: true, self_capture_open: false }];
  await provisionDemoAccounts(db.sb, randomBytes(24).toString("base64url"));
  expect(db.tables.relatives.filter(r => r.is_self)).toEqual([
    { id: "existing-self", family_id: DEMO_FAMILY_ID, name: "Rosa", is_self: true, self_capture_open: false },
  ]);
  expect(db.users.find(u => u.email === DEMO_ACCOUNTS[3].email)!.app_metadata.kin_contributor_id).toBeNull();
});

it("reuses a preexisting account and creates only the three missing users", async () => {
  const db = database([{ id: "existing-maya", email: DEMO_ACCOUNTS[0].email, app_metadata: {} } as User]);
  await provisionDemoAccounts(db.sb, randomBytes(24).toString("base64url"));
  expect(db.createUser).toHaveBeenCalledTimes(3);
  expect(db.users[0].id).toBe("existing-maya");
  expect(db.updateUserById).toHaveBeenCalledWith("existing-maya", expect.anything());
});

it("refuses missing passwords and foreign membership without writing", async () => {
  const db = database([{ id: "foreign", email: DEMO_ACCOUNTS[0].email, app_metadata: { kin_family_id: "other" },
    user_metadata: {}, aud: "authenticated", created_at: "2026-09-19T00:00:00Z" }]);
  await expect(provisionDemoAccounts(db.sb, "")).rejects.toThrow("password");
  await expect(provisionDemoAccounts(db.sb, randomBytes(24).toString("base64url"))).rejects.toThrow("another family");
  expect(db.tables).toEqual({});
  expect(db.createUser).not.toHaveBeenCalled();
  expect(db.updateUserById).not.toHaveBeenCalled();
});

it("renames a legacy family account without replacing its Auth ID", async () => {
  const db = database([{ id: "legacy-maya", email: "maya@legacy.example", app_metadata: { kin_family_id: "demo" },
    user_metadata: {}, aud: "authenticated", created_at: "2026-09-19T00:00:00Z" }]);
  await provisionDemoAccounts(db.sb, randomBytes(24).toString("base64url"));
  expect(db.users.find(u => u.id === "legacy-maya")?.email).toBe(DEMO_ACCOUNTS[0].email);
  expect(db.createUser).toHaveBeenCalledTimes(3);
  expect(db.users).toHaveLength(4);
  await provisionDemoAccounts(db.sb, randomBytes(24).toString("base64url"));
  expect(db.createUser).toHaveBeenCalledTimes(3);
});
