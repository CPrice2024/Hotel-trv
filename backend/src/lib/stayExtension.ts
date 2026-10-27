import jwt from "jsonwebtoken";

export function extensionNights(start: Date, endInput: string, originalCheckIn: Date, now = new Date()): { checkOut: Date; nights: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endInput)) throw new Error("Choose a valid checkout date.");
  const checkOut = new Date(`${endInput}T00:00:00.000Z`);
  if (!Number.isFinite(checkOut.getTime()) || checkOut.toISOString().slice(0, 10) !== endInput || checkOut <= start) {
    throw new Error("The new checkout must be later than the current checkout.");
  }
  const today = new Date(now); today.setUTCHours(0, 0, 0, 0);
  if (start < today) throw new Error("This stay has already ended. Create a new reservation instead.");
  if ((checkOut.getTime() - originalCheckIn.getTime()) / 86400000 > 60) throw new Error("The entire stay cannot exceed 60 nights.");
  return { checkOut, nights: (checkOut.getTime() - start.getTime()) / 86400000 };
}

export function paymentRequestToken(id: string, secret: string): string {
  return jwt.sign({ purpose: "stay-extension", bookingId: id }, secret, { expiresIn: "7d", audience: "booking-payment" });
}

export function readPaymentRequestToken(token: string, secret: string): string | null {
  try {
    const data = jwt.verify(token, secret, { audience: "booking-payment", algorithms: ["HS256"] });
    return typeof data !== "string" && data.purpose === "stay-extension" && typeof data.bookingId === "string" && /^[a-f\d]{24}$/i.test(data.bookingId) ? data.bookingId : null;
  } catch { return null; }
}

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function extensionEmail(data: { guestName: string; hotelName: string; reference: string; roomName: string; start: string; end: string; nights: number; quantity: number; amount: string; expires: string; url: string }): { text: string; html: string } {
  const lines = [
    `Hello ${data.guestName},`, `${data.hotelName} has prepared your stay extension.`,
    `Original booking: ${data.reference}`, `Room: ${data.roomName}`, `Extra stay: ${data.start} to ${data.end}`,
    `${data.nights} extra night(s), ${data.quantity} room(s)`, `Additional payment: ${data.amount}`,
    `Payment hold expires: ${data.expires}`, "Your existing paid booking is unchanged. The extra nights are confirmed only after verified payment.",
  ];
  const url = new URL(data.url);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("Invalid payment request URL.");
  return {
    text: [...lines, `Review details and pay now: ${url.href}`].join("\n"),
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:28px;color:#17352e"><h1>Stay extension payment request</h1>${lines.map(line => `<p>${escape(line)}</p>`).join("")}<p><a href="${escape(url.href)}" style="display:inline-block;padding:14px 24px;background:#17352e;color:white;text-decoration:none;border-radius:6px">Pay now</a></p><p>Review your extension details, then continue to secure payment.</p></div>`,
  };
}
