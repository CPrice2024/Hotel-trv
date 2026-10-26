import assert from "node:assert/strict";
import test from "node:test";
import { createChapaReference } from "../../lib/bookingReference.js";

test("Chapa references stay within the provider limit and are unique across retries", () => {
  const references = Array.from({ length: 100 }, createChapaReference);
  assert.equal(new Set(references).size, references.length);
  for (const reference of references) {
    assert.ok(reference.length <= 50);
    assert.match(reference, /^hotel-[a-f0-9-]+$/);
  }
});
