import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import express, { type RequestHandler } from "express";
import { createAdminRouter } from "../../admin.js";

let server: Server;
let base: string;
// Test the route's role boundaries independently of MongoDB and session cookies.
const authorize = (roles: ("admin" | "staff")[] = ["admin", "staff"]): RequestHandler => (req, res, next) => {
  const role = req.get("x-test-role");
  if (!role) { res.status(401).json({ error: "Authentication required" }); return; }
  if (!roles.includes(role as "admin" | "staff")) { res.status(403).json({ error: "Forbidden" }); return; }
  res.locals.staff = { id: "000000000000000000000001", role };
  next();
};
before(async () => {
  const app = express(); app.use(express.json()); app.use("/staff", createAdminRouter(authorize));
  server = await new Promise<Server>(resolve => { const listening = app.listen(0, "127.0.0.1", () => resolve(listening)); });
  const address = server.address();
  assert.ok(address && typeof address !== "string"); base = `http://127.0.0.1:${address.port}/staff`;
});
after(async () => { server?.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });

test("anonymous clients cannot read management records", async () => {
  for (const path of ["/bookings", "/guests", "/reports", "/users"]) assert.equal((await fetch(base + path)).status, 401);
});
test("staff cannot edit room data or access team management", async () => {
  for (const [method, path] of [["GET", "/users"], ["PUT", "/rooms/000000000000000000000001"], ["PATCH", "/users/000000000000000000000002"]]) {
    assert.equal((await fetch(base + path, { method, headers: { "x-test-role": "staff" } })).status, 403);
  }
});
test("booking filters reject malformed or unbounded query values", async () => {
  for (const query of ["page=-1", "limit=10000", "status=unknown", "currency=EUR", "search[$ne]=value"]) {
    assert.equal((await fetch(base + "/bookings?" + query, { headers: { "x-test-role": "admin" } })).status, 400);
  }
});
test("reports and guest lists reject invalid range and pagination", async () => {
  for (const path of ["/reports?days=0", "/reports?days=367", "/guests?page=0"]) assert.equal((await fetch(base + path, { headers: { "x-test-role": "admin" } })).status, 400);
});
test("invalid booking identifiers do not reach database queries", async () => {
  assert.equal((await fetch(base + "/bookings/not-an-id", { headers: { "x-test-role": "staff" } })).status, 400);
});
test("room edits reject invalid data before any database operation", async () => {
  const response = await fetch(base + "/rooms/000000000000000000000001", { method: "PUT", headers: { "x-test-role": "admin", "content-type": "application/json" }, body: JSON.stringify({ inventory: -5, priceUSD: 0 }) });
  assert.equal(response.status, 400);
});
