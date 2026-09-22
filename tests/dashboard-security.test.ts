import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { NextRequest } from "next/server";
import { POST as changePassword } from "../app/api/dashboard/password/route";
import { generateTemporaryPassword } from "../lib/server/temporaryPassword";

const originalFetch = global.fetch;
const originalSecret = process.env.SUPABASE_SECRET_KEY;

afterEach(() => {
  global.fetch = originalFetch;
  if (originalSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY = originalSecret;
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function passwordRequest() {
  return new NextRequest("https://example.test/api/dashboard/password", {
    method: "POST",
    headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
    body: JSON.stringify({ password: "NewPrivatePassword-123" }),
  });
}

test("temporary passwords are strong and distinct for each generation", () => {
  const first = generateTemporaryPassword();
  const second = generateTemporaryPassword();
  assert.equal(first.length, 32);
  assert.equal(second.length, 32);
  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]+$/);
});

test("first access changes Auth password before clearing either flag", async () => {
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  const calls: string[] = [];
  global.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url}`);
    if (url.endsWith("/auth/v1/user")) return json({ id: "user-1", email: "user@example.test" });
    if (url.includes("dashboard_prod_profiles?") && method === "GET") return json([{ user_id: "user-1", must_change_password: true }]);
    if (url.includes("dashboard_prod_allowed_users?") && method === "GET") return json([{ email: "user@example.test", active: true, must_change_password: true }]);
    if (url.includes("/auth/v1/token?grant_type=password")) return json({ error_code: "invalid_credentials" }, 400);
    if (url.includes("/auth/v1/admin/users/user-1")) return json({ id: "user-1" });
    if (url.includes("dashboard_prod_allowed_users?") && method === "PATCH") return json([{ email: "user@example.test", active: true, must_change_password: false }]);
    if (url.includes("dashboard_prod_profiles?") && method === "PATCH") return json([{ user_id: "user-1", must_change_password: false }]);
    throw new Error(`Unexpected call: ${method} ${url}`);
  };

  const response = await changePassword(passwordRequest());
  assert.equal(response.status, 200);
  const authUpdate = calls.findIndex((call) => call.includes("PUT ") && call.includes("/auth/v1/admin/users/"));
  const allowUpdate = calls.findIndex((call) => call.includes("PATCH ") && call.includes("dashboard_prod_allowed_users"));
  const profileUpdate = calls.findIndex((call) => call.includes("PATCH ") && call.includes("dashboard_prod_profiles"));
  assert.ok(authUpdate >= 0 && authUpdate < allowUpdate && allowUpdate < profileUpdate);
});

test("failed Auth password change leaves access flags untouched", async () => {
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  const calls: string[] = [];
  global.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url}`);
    if (url.endsWith("/auth/v1/user")) return json({ id: "user-1", email: "user@example.test" });
    if (url.includes("dashboard_prod_profiles?") && method === "GET") return json([{ user_id: "user-1", must_change_password: true }]);
    if (url.includes("dashboard_prod_allowed_users?") && method === "GET") return json([{ email: "user@example.test", active: true, must_change_password: true }]);
    if (url.includes("/auth/v1/token?grant_type=password")) return json({ error_code: "invalid_credentials" }, 400);
    if (url.includes("/auth/v1/admin/users/user-1")) return json({ error: "rejected" }, 400);
    throw new Error(`Unexpected call: ${method} ${url}`);
  };

  const response = await changePassword(passwordRequest());
  assert.equal(response.status, 502);
  assert.equal(calls.some((call) => call.startsWith("PATCH ")), false);
});

test("same password is rejected before any privileged update", async () => {
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  const calls: string[] = [];
  global.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url}`);
    if (url.endsWith("/auth/v1/user")) return json({ id: "user-1", email: "user@example.test" });
    if (url.includes("dashboard_prod_profiles?") && method === "GET") return json([{ user_id: "user-1", must_change_password: true }]);
    if (url.includes("dashboard_prod_allowed_users?") && method === "GET") return json([{ email: "user@example.test", active: true, must_change_password: true }]);
    if (url.includes("/auth/v1/token?grant_type=password")) return json({ access_token: "unused" });
    throw new Error(`Unexpected call: ${method} ${url}`);
  };

  const response = await changePassword(passwordRequest());
  assert.equal(response.status, 400);
  assert.equal(calls.some((call) => call.includes("/auth/v1/admin/users/") || call.startsWith("PATCH ")), false);
});

