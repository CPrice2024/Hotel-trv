import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import type { Server } from "node:http";
import express, { type RequestHandler } from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { ActivityLog, StaffSession, User } from "../../db/models.js";
import { createStaffAuthentication, deviceDetails, staffAction, trackStaffActivity } from "../../lib/staffSecurity.js";
import { createSecurityRouter } from "../../security.js";

const secret = "test-security-secret-at-least-32-characters";
const userId = "507f1f77bcf86cd799439011";
const sessionId = "507f1f77bcf86cd799439012";
const otherId = "507f1f77bcf86cd799439013";
const token = (options: { legacy?: boolean; secret?: string; expiresIn?: number } = {}) => jwt.sign({ role: "admin" }, options.secret ?? secret, { subject: userId, ...(!options.legacy ? { jwtid: sessionId } : {}), issuer: "ayele-hotel", audience: "ayele-hotel-staff", expiresIn: options.expiresIn ?? 3600 });

test("device detection distinguishes common browsers, mobile devices and operating systems", () => {
  assert.deepEqual(deviceDetails("Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537 Edg/130"), { browser: "Edge", os: "Windows", device: "Computer" });
  assert.deepEqual(deviceDetails("Mozilla/5.0 (iPhone; CPU iPhone OS) Mobile Safari/604"), { browser: "Safari", os: "iOS", device: "Phone" });
  assert.equal(deviceDetails("Mozilla/5.0 (Linux; Android 14) Chrome/130 Safari/537").device, "Tablet");
  assert.equal(deviceDetails("Mozilla/5.0 Firefox/130").browser, "Firefox");
});
test("activity classification only records known actions and never captures query strings or bodies", () => {
  assert.equal(staffAction("PATCH", `/api/staff/bookings/${userId}/cancel`)?.action, "Cancelled reservation");
  assert.equal(staffAction("POST", "/api/staff/login")?.audit, true);
  assert.equal(staffAction("GET", "/api/staff/bookings")?.audit, false);
  assert.equal(staffAction("POST", "/api/payments/checkout"), null);
  assert.equal(staffAction("GET", "/api/staff/me"), null);
  assert.equal(staffAction("POST", "/api/staff/unknown-secret"), null);
});

let server: Server;
let base: string;
const authenticate = createStaffAuthentication(secret, "test_session");
before(async () => {
  const app = express(); app.use(express.json()); app.use(cookieParser()); app.use(trackStaffActivity);
  app.get("/api/staff/test", authenticate(), (_req, res) => res.json({ ok: true }));
  app.post("/api/staff/rooms", authenticate(["admin"]), (_req, res) => res.status(201).json({ ok: true }));
  app.patch("/api/staff/rooms/:id", authenticate(["admin"]), (_req, res) => res.status(409).json({ error: "Rejected test action" }));
  app.use("/api/staff/security", createSecurityRouter(authenticate(["admin"])));
  server = await new Promise<Server>(resolve => { const listening = app.listen(0, "127.0.0.1", () => resolve(listening)); });
  const address = server.address(); assert.ok(address && typeof address !== "string"); base = `http://127.0.0.1:${address.port}`;
});
after(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
const request = (path: string, jwtToken = token(), method = "GET", body?: unknown) => fetch(base + path, { method, headers: { cookie: `test_session=${jwtToken}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });

test("session authentication rejects expired, forged, legacy, revoked and inactive-account sessions", async () => {
  let sessionExists = true;
  let accountExists = true;
  let role = "admin";
  const methods = [
    mock.method(StaffSession, "findOne", (filter: { revokedAt: unknown; expiresAt: { $gt: Date }; user: string }) => {
      assert.equal(filter.revokedAt, null); assert.ok(filter.expiresAt.$gt instanceof Date); assert.equal(filter.user, userId);
      return { lean: async () => sessionExists ? { browser: "Chrome", os: "Windows", device: "Computer", ip: "127.0.0.1" } : null };
    }),
    mock.method(User, "findOne", (filter: { active: boolean }) => { assert.equal(filter.active, true); return { select: async () => accountExists ? { _id: userId, role, name: "Admin", email: "admin@example.com" } : null }; }),
    mock.method(StaffSession, "updateOne", async () => ({ matchedCount: 1 })),
  ];
  try {
    assert.equal((await request("/api/staff/test", "forged")).status, 401);
    assert.equal((await request("/api/staff/test", token({ secret: "wrong-secret" }))).status, 401);
    assert.equal((await request("/api/staff/test", token({ expiresIn: -1 }))).status, 401);
    assert.equal((await request("/api/staff/test", token({ legacy: true }))).status, 401);
    assert.equal((await request("/api/staff/test")).status, 200);
    sessionExists = false;
    assert.equal((await request("/api/staff/test")).status, 401);
    sessionExists = true; accountExists = false;
    assert.equal((await request("/api/staff/test")).status, 401);
    accountExists = true; role = "staff";
    // JWT says admin, but the live account role controls access.
    for (const path of ["/api/staff/security/sessions", "/api/staff/security/activity"]) assert.equal((await request(path)).status, 403);
    assert.equal((await request("/api/staff/security/sessions/revoke-others", token(), "POST")).status, 403);
  } finally { for (const method of methods) method.mock.restore(); }
});

test("session revocation scopes other-session removal to the actor and audits only successful known mutations", async () => {
  const logs: Record<string, unknown>[] = [];
  const methods = [
    mock.method(StaffSession, "findOne", () => ({ lean: async () => ({ browser: "Chrome", os: "Windows", device: "Computer", ip: "127.0.0.1" }) })),
    mock.method(User, "findOne", () => ({ select: async () => ({ _id: userId, role: "admin", name: "Admin", email: "admin@example.com" }) })),
    mock.method(StaffSession, "updateOne", async () => ({ matchedCount: 1 })),
    mock.method(StaffSession, "updateMany", async (filter: { user: string; _id: { $ne: string }; revokedAt: unknown; expiresAt: { $gt: Date } }) => {
      assert.equal(filter.user, userId); assert.equal(filter._id.$ne, sessionId); assert.equal(filter.revokedAt, null); assert.ok(filter.expiresAt.$gt instanceof Date);
      return { modifiedCount: 2 };
    }),
    mock.method(ActivityLog, "create", async (entry: Record<string, unknown>) => { logs.push(entry); return entry; }),
  ];
  try {
    assert.equal((await request("/api/staff/security/sessions/invalid/revoke", token(), "POST")).status, 400);
    assert.equal((await request(`/api/staff/security/sessions/${sessionId}/revoke`, token(), "POST")).status, 409);
    const response = await request("/api/staff/security/sessions/revoke-others", token(), "POST");
    assert.equal(response.status, 200); assert.equal((await response.json()).revoked, 2);
    assert.equal((await request(`/api/staff/security/sessions/${otherId}/revoke`, token(), "POST")).status, 200);
    assert.equal((await request("/api/staff/rooms?secret=query-secret", token(), "POST", { password: "do-not-log", guestEmail: "private@example.com" })).status, 201);
    assert.equal((await request(`/api/staff/rooms/${otherId}`, token(), "PATCH", { active: true })).status, 409);
    assert.equal(logs.length, 3);
    assert.equal(logs[2].action, "Created room type"); assert.equal(logs[2].actor, userId); assert.equal(logs[2].session, sessionId);
    for (const sensitive of ["do-not-log", "private@example.com", "query-secret", token()]) assert.ok(!JSON.stringify(logs).includes(sensitive));
    assert.equal((await request("/api/staff/security/sessions?page=-1")).status, 400);
    assert.equal((await request("/api/staff/security/activity?page=0")).status, 400);
  } finally { for (const method of methods) method.mock.restore(); }
});
