const bookingIdsKey = "ayele-hotel-my-booking-ids";
const activeBookingKey = "ayele-hotel-active-booking";

interface ActiveBooking {
  bookingId: string;
  guestEmail: string;
}

export function rememberActiveBooking(bookingId: string, guestEmail: string) {
  try {
    sessionStorage.setItem(
      activeBookingKey,
      JSON.stringify({ bookingId, guestEmail: guestEmail.trim().toLowerCase() }),
    );
  } catch (error) {
    console.warn("Could not save this booking for receipt retrieval.", error);
  }

  try {
    const stored: unknown = JSON.parse(localStorage.getItem(bookingIdsKey) ?? "[]");
    const ids = Array.isArray(stored)
      ? stored.filter((id): id is string => typeof id === "string" && /^[a-f\d]{24}$/i.test(id))
      : [];
    localStorage.setItem(bookingIdsKey, JSON.stringify([bookingId, ...ids.filter((id) => id !== bookingId)].slice(0, 10)));
  } catch (error) {
    console.warn("Could not save this booking in My bookings.", error);
  }
}

export function getActiveBookingEmail(bookingId: string): string {
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(activeBookingKey) ?? "null");
    if (
      typeof stored === "object" &&
      stored !== null &&
      "bookingId" in stored &&
      stored.bookingId === bookingId &&
      "guestEmail" in stored &&
      typeof stored.guestEmail === "string"
    ) {
      return stored.guestEmail;
    }
  } catch (error) {
    console.warn("Could not read saved booking receipt details.", error);
  }
  return "";
}

export function getRememberedBookingIds(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(bookingIdsKey) ?? "[]");
    if (!Array.isArray(stored)) return [];
    return stored.filter(
      (id): id is string => typeof id === "string" && /^[a-f\d]{24}$/i.test(id),
    );
  } catch (error) {
    console.warn("Could not read saved booking references.", error);
    return [];
  }
}

export function clearActiveBooking(bookingId: string) {
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(activeBookingKey) ?? "null");
    if (
      typeof stored === "object" &&
      stored !== null &&
      "bookingId" in stored &&
      stored.bookingId === bookingId
    ) {
      sessionStorage.removeItem(activeBookingKey);
    }
  } catch (error) {
    console.warn("Could not clear saved booking receipt details.", error);
  }
}

export function parseActiveBooking(value: string | null): ActiveBooking | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "bookingId" in parsed &&
      typeof parsed.bookingId === "string" &&
      /^[a-f\d]{24}$/i.test(parsed.bookingId) &&
      "guestEmail" in parsed &&
      typeof parsed.guestEmail === "string"
    ) {
      return { bookingId: parsed.bookingId, guestEmail: parsed.guestEmail };
    }
  } catch (error) {
    console.warn("Could not parse the active booking details.", error);
  }
  return null;
}
