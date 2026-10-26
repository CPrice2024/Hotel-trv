export interface RoomPricing {
  priceETB: number;
  priceUSDCents: number;
}

export interface BookingPrice {
  totalMinor: number;
  usdToEtbRate: number | null;
}

export function calculateBookingPrice(
  room: RoomPricing,
  currency: "ETB" | "USD",
  nights: number,
  quantity: number,
  liveUsdToEtbRate?: number,
): BookingPrice {
  if (currency === "USD") {
    return {
      totalMinor: room.priceUSDCents * nights * quantity,
      usdToEtbRate: null,
    };
  }

  if (room.priceETB > 0) {
    return {
      totalMinor: room.priceETB * nights * quantity,
      usdToEtbRate: null,
    };
  }

  if (
    typeof liveUsdToEtbRate !== "number" ||
    !Number.isFinite(liveUsdToEtbRate) ||
    liveUsdToEtbRate <= 0
  ) {
    throw new Error("A valid live USD-to-ETB rate is required for this room.");
  }

  const nightlyEtbRate = Math.round((room.priceUSDCents / 100) * liveUsdToEtbRate);
  if (nightlyEtbRate <= 0) {
    throw new Error("The converted ETB room rate is invalid.");
  }

  return {
    totalMinor: nightlyEtbRate * nights * quantity,
    usdToEtbRate: liveUsdToEtbRate,
  };
}
