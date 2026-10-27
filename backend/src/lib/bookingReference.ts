import { randomUUID } from "node:crypto";

export function formatBookingReference(id: string): string {
  return /^[a-f\d]{24}$/i.test(id) ? `AD-${id.slice(-10).toUpperCase()}` : id;
}

export function shortBookingReferenceSuffix(value: string): string | null {
  return /^AD-[a-f\d]{10}$/i.test(value) ? value.slice(3).toLowerCase() : null;
}

// Chapa accepts at most 50 characters. Keep the booking ID in our database.
export function createChapaReference(): string {
  return `hotel-${randomUUID()}`;
}

export function readChapaReference(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const fields = input as Record<string, unknown>;
  for (const key of ["tx_ref", "trx_ref"]) {
    const value = fields[key];
    if (typeof value === "string" && value.trim() && value.length <= 50) return value.trim();
  }
  return null;
}
