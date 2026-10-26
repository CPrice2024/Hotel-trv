import assert from "node:assert/strict";
import test from "node:test";
import { calculateBookingPrice } from "../../db/bookingPricing.js";

test("uses configured Birr rates without applying a currency conversion", () => {
  assert.deepEqual(
    calculateBookingPrice(
      { priceETB: 2_500, priceUSDCents: 6_500 },
      "ETB",
      3,
      2,
      155,
    ),
    { totalMinor: 15_000, usdToEtbRate: null },
  );
});

test("converts the USD nightly price to whole Birr and stores the applied rate", () => {
  assert.deepEqual(
    calculateBookingPrice(
      { priceETB: 0, priceUSDCents: 6_500 },
      "ETB",
      3,
      2,
      155.25,
    ),
    { totalMinor: 60_546, usdToEtbRate: 155.25 },
  );
});

test("keeps USD bookings in cents and does not apply a Birr rate", () => {
  assert.deepEqual(
    calculateBookingPrice(
      { priceETB: 2_500, priceUSDCents: 6_500 },
      "USD",
      3,
      2,
      155,
    ),
    { totalMinor: 39_000, usdToEtbRate: null },
  );
});

test("rejects Birr conversion when the live rate is missing or invalid", () => {
  assert.throws(
    () => calculateBookingPrice({ priceETB: 0, priceUSDCents: 6_500 }, "ETB", 1, 1),
    /valid live USD-to-ETB rate/,
  );
  assert.throws(
    () => calculateBookingPrice({ priceETB: 0, priceUSDCents: 6_500 }, "ETB", 1, 1, Number.NaN),
    /valid live USD-to-ETB rate/,
  );
});
