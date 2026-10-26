import { randomUUID } from "node:crypto";

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
