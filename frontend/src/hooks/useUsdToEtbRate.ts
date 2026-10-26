import { useQuery } from "@tanstack/react-query";
import { getLocale, translateText } from "../i18n/language";

interface ExchangeRateResponse {
  result: string;
  time_last_update_utc: string;
  rates: { ETB?: number };
}

async function fetchUsdToEtbRate(signal: AbortSignal) {
  const response = await fetch("https://open.er-api.com/v6/latest/USD", { signal });
  if (!response.ok) {
    throw new Error("Birr prices are temporarily unavailable.");
  }

  const data = (await response.json()) as ExchangeRateResponse;
  const rate = data.rates?.ETB;
  if (
    data.result !== "success" ||
    typeof rate !== "number" ||
    !Number.isFinite(rate) ||
    rate <= 0 ||
    !data.time_last_update_utc
  ) {
    throw new Error("The exchange-rate service returned invalid Birr pricing.");
  }

  const updatedAt = new Date(data.time_last_update_utc);
  if (Number.isNaN(updatedAt.getTime())) {
    throw new Error("The exchange-rate service returned an invalid update time.");
  }

  return { rate, updatedAt };
}

export function useUsdToEtbRate() {
  return useQuery({
    queryKey: ["exchange-rate", "USD", "ETB"],
    queryFn: ({ signal }) => fetchUsdToEtbRate(signal),
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
    retry: 1,
  });
}

export function formatEtb(amount: number) {
  return new Intl.NumberFormat(getLocale(), {
    style: "currency",
    currency: "ETB",
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

export function convertUsdPricesToEtb(text: string, rate?: number) {
  return translateText(text).replace(/\$(\d+(?:\.\d{1,2})?)/g, (_match, amount: string) =>
    rate ? formatEtb(Number(amount) * rate) : "price available on request",
  );
}

export function formatRateTimestamp(date: Date) {
  return new Intl.DateTimeFormat(getLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}
