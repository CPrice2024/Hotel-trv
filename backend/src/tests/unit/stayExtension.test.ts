import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import type { Server } from "node:http";
import express, { type RequestHandler } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { Booking, InventoryNight, Room } from "../../db/models.js";
import { createExtensionRouter } from "../../extensions.js";
import { extensionEmail, extensionNights, paymentRequestToken, readPaymentRequestToken } from "../../lib/stayExtension.js";

const secret = "test-only-payment-request-secret-123456789";
const id = "507f1f77bcf86cd799439011";
test("extension dates reject backdating, invalid calendar dates, and stays longer than 60 nights", () => {
  const start = new Date("2030-01-10T00:00:00Z");
  const checkIn = new Date("2030-01-01T00:00:00Z");
  const now = new Date("2030-01-05T12:00:00Z");
  assert.equal(extensionNights(start, "2030-01-12", checkIn, now).nights, 2);
  for (const value of ["2030-01-10", "2030-01-09", "2030-02-30", "2030-03-10", "invalid"]) {
    assert.throws(() => extensionNights(start, value, checkIn, now));
  }
  assert.throws(() => extensionNights(start, "2030-01-12", checkIn, new Date("2030-01-11")));
});
test("payment links accept only signed extension tokens for the payment audience", () => {
  assert.equal(readPaymentRequestToken(paymentRequestToken(id, secret), secret), id);
  assert.equal(readPaymentRequestToken(paymentRequestToken(id, secret), "wrong-secret"), null);
  for (const payload of [{ bookingId: id }, { purpose: "stay-extension", bookingId: "invalid" }]) {
    assert.equal(readPaymentRequestToken(jwt.sign(payload, secret, { audience: "booking-payment" }), secret), null);
  }
  assert.equal(readPaymentRequestToken(jwt.sign({ purpose: "stay-extension", bookingId: id }, secret, { audience: "staff" }), secret), null);
  assert.equal(readPaymentRequestToken(jwt.sign({ purpose: "stay-extension", bookingId: id }, secret, { audience: "booking-payment", expiresIn: -1 }), secret), null);
});
test("request email escapes guest data and includes dates, extra amount, expiry, and payment action", () => {
  const email = extensionEmail({ guestName: '<script>alert("x")</script>', hotelName: "Test hotel", reference: "AD-D799439011", roomName: "Suite", start: "2030-01-10", end: "2030-01-12", nights: 2, quantity: 1, amount: "USD 170.00", expires: "2030-01-06T12:00:00Z", url: "https://hotel.example/booking/payment-request#secret" });
  assert.ok(!email.html.includes("<script>"));
  for (const value of ["USD 170.00", "2030-01-10", "2030-01-12", "Pay now", "#secret", "2030-01-06T12:00:00Z"]) assert.ok(email.html.includes(value), value);
});

let server: Server;
let base: string;
const delivered: { to: string; html: string }[] = [];
let failEmail = false;
const admin: RequestHandler = (req, res, next) => { if (req.get("x-test-role") !== "admin") { res.status(403).json({ error: "Forbidden" }); return; } next(); };
before(async () => {
  const app = express(); app.use(express.json());
  app.use(createExtensionRouter({ admin, guestLimiter: (_req, _res, next) => next(), secret, hotelName: "Test Hotel", frontendUrl: "https://hotel.example", emailConfigured: true, liveRate: async () => ({ rate: 150 }), sendEmail: async data => { if (failEmail) throw new Error("Simulated email failure"); delivered.push(data); } }));
  server = await new Promise<Server>(resolve => { const listening = app.listen(0, "127.0.0.1", () => resolve(listening)); });
  const address = server.address(); assert.ok(address && typeof address !== "string"); base = `http://127.0.0.1:${address.port}`;
});
after(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
const post = (path: string, body: unknown, role = "admin") => fetch(base + path, { method: "POST", headers: { "content-type": "application/json", "x-test-role": role }, body: JSON.stringify(body) });
test("extension changes are admin-only and payment lookup rejects forged links", async () => {
  for (const path of [`/staff/bookings/${id}/extensions/quote`, `/staff/bookings/${id}/extensions`, `/staff/bookings/${id}/payment-request-email`]) {
    assert.equal((await post(path, {}, "staff")).status, 403);
  }
  assert.equal((await post("/guest/payment-request", { token: "forged" })).status, 404);
});

test("admin previews extra nights, creates a linked hold, emails guest, and guest securely retrieves payment details", async () => {
  const start = new Date(); start.setUTCHours(0, 0, 0, 0); start.setUTCDate(start.getUTCDate() + 2);
  const end = new Date(start.getTime() + 2 * 86400000).toISOString().slice(0, 10);
  const parent = new Booking({ _id: id, room: "507f1f77bcf86cd799439012", roomName: "Suite", guestName: "Guest", guestEmail: "guest@example.com", guestPhone: "+251900000000", checkIn: new Date(start.getTime() - 86400000), checkOut: start, nights: 1, quantity: 2, guests: 2, currency: "USD", totalMinor: 17000, paymentGateway: "stripe", paymentStatus: "paid", status: "confirmed", holdExpiresAt: start });
  const room = { _id: parent.room, inventory: 10, priceETB: 0, priceUSDCents: 8500 };
  let extension: InstanceType<typeof Booking> | null = null;
  let allocated = 0;
  let unavailable = false;
  const methods = [
    mock.method(Booking, "findById", (lookup: string) => { const value = lookup.toString() === id ? parent : extension; return { then: (resolve: (value: unknown) => void) => resolve(value), lean: async () => value?.toObject() }; }),
    mock.method(Booking, "find", () => ({ sort: async () => extension?.status === "pending" ? [extension] : [] })),
    mock.method(Room, "findOne", async () => room),
    mock.method(InventoryNight, "exists", async () => unavailable ? { _id: id } : null),
    mock.method(mongoose, "startSession", async () => ({ async withTransaction(fn: () => Promise<void>) { await fn(); }, async endSession() {} })),
    mock.method(Booking, "findOneAndUpdate", async () => parent),
    mock.method(Booking, "exists", () => ({ session: async () => extension?.status === "pending" ? { _id: extension._id } : null })),
    mock.method(Booking, "findOne", () => ({ sort: () => ({ session: async () => null }) })),
    mock.method(Room, "findOneAndUpdate", async () => room),
    mock.method(InventoryNight, "updateOne", async () => ({ matchedCount: 1 })),
    mock.method(InventoryNight, "findOneAndUpdate", async () => { allocated += parent.quantity; return { remaining: 8 }; }),
    mock.method(Booking, "create", async (values: object[]) => { extension = new Booking(values[0]); return [extension]; }),
    mock.method(Booking, "updateOne", async () => ({ matchedCount: 1 })),
  ];
  try {
    const path = `/staff/bookings/${id}/extensions`;
    parent.status = "cancelled";
    assert.equal((await post(path + "/quote", { checkOut: end })).status, 409);
    parent.status = "confirmed";
    parent.refundRequired = true;
    assert.equal((await post(path + "/quote", { checkOut: end })).status, 409);
    parent.refundRequired = false;
    assert.equal((await post(path + "/quote", { checkOut: start.toISOString().slice(0, 10) })).status, 400);
    unavailable = true;
    assert.equal((await post(path + "/quote", { checkOut: end })).status, 409);
    unavailable = false;
    const quoted = await post(path + "/quote", { checkOut: end });
    assert.equal(quoted.status, 200);
    const { quote } = await quoted.json(); assert.equal(quote.totalMinor, 34000); assert.equal(quote.nights, 2);
    assert.equal((await post(path, { checkOut: end, quotedTotalMinor: 100 })).status, 409);
    const created = await post(path, { checkOut: end, quotedTotalMinor: quote.totalMinor });
    assert.equal(created.status, 201); assert.equal((await created.json()).emailSent, true);
    assert.equal(allocated, 4); // Two rooms for two extra nights, never the already-paid nights.
    assert.equal(parent.checkOut.getTime(), start.getTime()); assert.equal(parent.totalMinor, 17000);
    const email = delivered.at(-1)!; assert.equal(email.to, "guest@example.com");
    const encodedToken = email.html.match(/payment-request#([^"<]+)/)![1];
    const details = await post("/guest/payment-request", { token: encodedToken });
    assert.equal(details.status, 200);
    const { booking } = await details.json(); assert.equal(booking.parentBooking, id); assert.equal(booking.totalMinor, 34000); assert.equal(booking.status, "pending");
    assert.equal((await post(path, { checkOut: end, quotedTotalMinor: quote.totalMinor })).status, 409);
    const resend = await post(`/staff/bookings/${booking.id}/payment-request-email`, {}); assert.equal(resend.status, 200);
    const held = extension as InstanceType<typeof Booking> | null;
    assert.ok(held);
    held.holdExpiresAt = new Date(Date.now() - 1000);
    assert.equal((await post(`/staff/bookings/${booking.id}/payment-request-email`, {})).status, 409);
    // Delivery failure leaves a visible pending request which can be retried, rather than creating duplicate holds.
    extension = null; failEmail = true;
    const unsent = await post(path, { checkOut: end, quotedTotalMinor: quote.totalMinor });
    assert.equal(unsent.status, 201); assert.equal((await unsent.json()).emailSent, false);
  } finally { failEmail = false; for (const method of methods) method.mock.restore(); }
});
