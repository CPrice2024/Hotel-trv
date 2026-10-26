export interface BookingEmailData {
  hotelName: string;
  hotelAddress: string;
  hotelPhone: string;
  hotelEmail: string;
  websiteUrl: string;
  reference: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  roomName: string;
  checkIn: Date;
  checkOut: Date;
  nights: number;
  quantity: number;
  guests: number;
  currency: "ETB" | "USD";
  totalMinor: number;
  paymentGateway: string;
  paymentReference: string;
}

const escape = (value: unknown): string => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]!));

export function renderBookingEmail(data: BookingEmailData): string {
  const e = escape;
  const amount = (value: number) => `${data.currency} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / (data.currency === "USD" ? 100 : 1))}`;
  const date = (value: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(value);
  const row = (label: string, value: unknown) => `<tr><td style="padding:10px 0;border-bottom:1px solid #e9e6dd;color:#6e756f;font-size:13px;vertical-align:top;width:42%">${e(label)}</td><td style="padding:10px 0;border-bottom:1px solid #e9e6dd;color:#17352e;font-size:13px;vertical-align:top;word-break:break-word">${e(value)}</td></tr>`;
  let bookingsUrl = "";
  try { const url = new URL(data.websiteUrl); if (["https:", "http:"].includes(url.protocol)) bookingsUrl = new URL("/my-bookings", url.origin).href; } catch { /* No link when the website origin is invalid. */ }
  const title = (text: string) => `<h2 style="font-family:Arial,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#94713b;margin:28px 0 12px">${e(text)}</h2>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Reservation confirmation</title></head>
<body style="margin:0;padding:0;background:#f4f2eb;font-family:Arial,Helvetica,sans-serif;color:#243a30">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">Your reservation is confirmed. ${e(data.roomName)} · ${e(date(data.checkIn))} to ${e(date(data.checkOut))}.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f2eb"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fffefa;border:1px solid #e4dfd1">
<tr><td style="padding:32px 28px;background:#17352e;border-top:5px solid #c7a46a;text-align:center">
<div style="display:inline-block;border:1px solid #c7a46a;border-radius:50%;width:42px;line-height:42px;font-family:Georgia,serif;font-size:26px;color:#e2c18a">A</div>
<p style="font-family:Georgia,'Times New Roman',serif;font-size:25px;line-height:1.35;color:#fffefa;margin:16px 0 6px">${e(data.hotelName)}</p>
<p style="color:#d4c29e;font-size:10px;letter-spacing:3px;margin:0">YOUR RESERVATION CONFIRMATION</p></td></tr>
<tr><td style="padding:30px 28px 20px">
<span style="display:inline-block;background:#eaf3e6;color:#315b37;font-size:11px;letter-spacing:1px;padding:8px 12px;border-radius:3px">CONFIRMED &amp; PAID</span>
<h1 style="font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:normal;line-height:1.25;margin:20px 0 14px;color:#17352e">Your stay awaits.</h1>
<p style="font-size:14px;line-height:1.8;margin:0 0 20px">Dear ${e(data.guestName)},<br>Thank you for choosing ${e(data.hotelName)}. Your payment has been confirmed. Please keep this reservation slip for your arrival.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f1e6;border-left:3px solid #c7a46a"><tr><td style="padding:16px"><span style="font-size:10px;letter-spacing:1.5px;color:#756548">BOOKING REFERENCE</span><p style="font-family:monospace;font-size:14px;color:#17352e;margin:8px 0 0;word-break:break-all">${e(data.reference)}</p></td></tr></table>
${title("Stay details")}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
${row("Room type", data.roomName)}${row("Check-in date", date(data.checkIn))}${row("Check-out date", date(data.checkOut))}${row("Duration", `${data.nights} ${data.nights === 1 ? "night" : "nights"}`)}${row("Rooms / guests", `${data.quantity} room(s) · ${data.guests} guest(s)`)}
</table>
${title("Guest details")}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${row("Guest name", data.guestName)}${row("Email", data.guestEmail)}${row("Phone", data.guestPhone)}</table>
${title("Payment summary")}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${row("Rate / room / night", amount(data.totalMinor / data.nights / data.quantity))}${row("Payment method", data.paymentGateway === "chapa" ? "Chapa · Ethiopian Birr" : "Stripe · US dollars")}${data.paymentReference ? row("Payment reference", data.paymentReference) : ""}</table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;background:#17352e"><tr><td style="padding:20px 16px;color:#fffefa;font-size:13px">TOTAL PAID</td><td align="right" style="padding:20px 16px;color:#f0d4a0;font-size:23px;font-family:Georgia,serif">${e(amount(data.totalMinor))}</td></tr></table>
${bookingsUrl ? `<p style="text-align:center;margin:28px 0"><a href="${e(bookingsUrl)}" style="display:inline-block;background:#17352e;color:#fffefa;text-decoration:none;padding:14px 24px;border-radius:3px;font-size:13px">View my booking</a></p><p style="font-size:11px;line-height:1.6;color:#6e756f;text-align:center">Use your booking reference and booking email to look up your reservation.</p>` : ""}
<p style="font-size:12px;line-height:1.8;color:#6e756f;margin:24px 0 8px">Need help with your stay? Contact the hotel using the details below and include your booking reference. Any booking changes are subject to the hotel's policies.</p>
</td></tr>
<tr><td style="padding:24px 28px;background:#f5f1e6;border-top:1px solid #e4dfd1;text-align:center;font-size:12px;line-height:1.9;color:#5f685e"><strong style="color:#17352e">${e(data.hotelName)}</strong><br>${[data.hotelAddress, data.hotelPhone, data.hotelEmail].filter(Boolean).map(e).join("<br>")}<p style="font-size:10px;color:#81877d;margin:14px 0 0">Reservation confirmation · Please retain for your records.<br>This slip confirms your reservation and payment; it is not a tax invoice.</p></td></tr>
</table></td></tr></table></body></html>`;
}
