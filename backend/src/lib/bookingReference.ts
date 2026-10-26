import { randomUUID } from "node:crypto";

// Chapa accepts at most 50 characters. Keep the booking ID in our database.
export function createChapaReference(): string {
  return `hotel-${randomUUID()}`;
}
