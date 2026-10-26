import assert from "node:assert/strict";
import test from "node:test";
import { createChapaReference, readChapaReference } from "../../lib/bookingReference.js";

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
