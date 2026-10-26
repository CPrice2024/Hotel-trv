import assert from "node:assert/strict";
import test from "node:test";
import { renderBookingEmail, type BookingEmailData } from "../../lib/bookingEmail.js";

const data: BookingEmailData = {
  hotelName: "Ayele Degu International Hotel", hotelAddress: "Dilla, Ethiopia", hotelPhone: "+251900000000",
  hotelEmail: "hotel@example.com", websiteUrl: "https://hotel.example.com", reference: "booking-123",
  guestName: "Test Guest", guestEmail: "guest@example.com", guestPhone: "+251911111111", roomName: "Deluxe Room",
  checkIn: new Date("2026-11-01T00:00:00Z"), checkOut: new Date("2026-11-03T00:00:00Z"),
  nights: 2, quantity: 2, guests: 4, currency: "USD", totalMinor: 26000, paymentGateway: "stripe", paymentReference: "cs_test_123",
};
test("reservation slip includes guest, stay, provider reference, and correct USD totals", () => {
  const html = renderBookingEmail(data);
  for (const text of ["booking-123", "Deluxe Room", "Test Guest", "1 Nov 2026", "3 Nov 2026", "USD 65.00", "USD 260.00", "cs_test_123", "CONFIRMED &amp; PAID", "https://hotel.example.com/my-bookings"]) assert.ok(html.includes(text), text);
});
test("Birr amounts remain in whole-Birr storage units", () => {
  const html = renderBookingEmail({ ...data, currency: "ETB", totalMinor: 20000, paymentGateway: "chapa" });
  assert.ok(html.includes("ETB 20,000.00")); assert.ok(html.includes("ETB 5,000.00")); assert.ok(html.includes("Chapa"));
});
test("guest and hotel fields are escaped and unsafe website links are omitted", () => {
  const html = renderBookingEmail({ ...data, guestName: '<script>alert("x")</script>', hotelAddress: '<img src=x onerror="alert(1)">', websiteUrl: "javascript:alert(1)" });
  assert.ok(!html.includes("<script>")); assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<img")); assert.ok(!html.includes('href="javascript:'));
});
