import assert from "node:assert/strict";
import test from "node:test";
import { createChapaReference, readChapaReference, formatBookingReference, shortBookingReferenceSuffix } from "../../lib/bookingReference.js";

test("short booking references round-trip and reject invalid lookup values", () => {
  const id = "507f1f77bcf86cd799439011";
  assert.equal(formatBookingReference(id), "AD-D799439011");
  assert.equal(shortBookingReferenceSuffix(formatBookingReference(id)), id.slice(-10));
  assert.equal(shortBookingReferenceSuffix("ad-d799439011"), id.slice(-10));
  for (const value of [id, "AD-.*", "AD-D79943901", "AD-D7994390110"]) {
    assert.equal(shortBookingReferenceSuffix(value), null);
  }
});

test("Chapa references stay within the provider limit and are unique across retries", () => {
  const references = Array.from({ length: 100 }, createChapaReference);
  assert.equal(new Set(references).size, references.length);
  for (const reference of references) {
    assert.ok(reference.length <= 50);
    assert.match(reference, /^hotel-[a-f0-9-]+$/);
  }
});

test("Chapa return and callback references support both provider field names", () => {
  assert.equal(readChapaReference({ tx_ref: "hotel-return" }), "hotel-return");
  assert.equal(readChapaReference({ trx_ref: "hotel-callback" }), "hotel-callback");
  assert.equal(readChapaReference({ status: "success", ref_id: "provider-id" }), null);
  assert.equal(readChapaReference({ tx_ref: ["one", "two"] }), null);
  assert.equal(readChapaReference(undefined), null);
});
