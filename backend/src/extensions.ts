import { Router, type RequestHandler } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { Booking, InventoryNight, Room } from "./db/models.js";
import { calculateBookingPrice } from "./db/bookingPricing.js";
import { formatBookingReference } from "./lib/bookingReference.js";
import { extensionEmail, extensionNights, paymentRequestToken, readPaymentRequestToken } from "./lib/stayExtension.js";

interface Dependencies {
  admin: RequestHandler;
  guestLimiter: RequestHandler;
  secret: string;
  hotelName: string;
  frontendUrl: string;
  emailConfigured: boolean;
  liveRate: () => Promise<{ rate: number }>;
  sendEmail: (data: { to: string; subject: string; text: string; html: string }) => Promise<void>;
}
class ExtensionError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const input = z.object({ checkOut: z.string(), quotedTotalMinor: z.number().int().positive().optional() });
const validId = (id: unknown): id is string => typeof id === "string" && /^[a-f\d]{24}$/i.test(id);

export function createExtensionRouter(deps: Dependencies) {
  const router = Router();
  const handle = (fn: (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => Promise<void>): RequestHandler => (req, res, next) => {
    void fn(req, res).catch(error => {
      if (error instanceof ExtensionError) res.status(error.status).json({ error: error.message });
      else next(error);
    });
  };

  async function quote(id: unknown, checkOut: string) {
    if (!validId(id)) throw new ExtensionError("Invalid booking reference.");
    const parent = await Booking.findById(id);
    if (!parent || parent.parentBooking || parent.status !== "confirmed" || parent.paymentStatus !== "paid" || parent.refundRequired) {
      throw new ExtensionError("Only an original, confirmed paid reservation without a refund flag can be extended.", 409);
    }
    const extensions = await Booking.find({ parentBooking: parent._id, status: { $in: ["pending", "confirmed"] } }).sort({ checkOut: -1 });
    if (extensions.some(e => e.status === "pending")) throw new ExtensionError("An extension payment request is already pending. Resend or cancel it before creating another.", 409);
    const start = extensions[0]?.checkOut ?? parent.checkOut;
    let plan: ReturnType<typeof extensionNights>;
    try { plan = extensionNights(start, checkOut, parent.checkIn); }
    catch (error) { throw new ExtensionError((error as Error).message); }
    const room = await Room.findOne({ _id: parent.room, active: true });
    if (!room) throw new ExtensionError("This room type is unavailable.", 409);
    let rate: number | undefined;
    if (parent.currency === "ETB" && room.priceETB === 0) {
      try { rate = (await deps.liveRate()).rate; }
      catch { throw new ExtensionError("Live Birr pricing is unavailable. Please retry shortly.", 503); }
    }
    const price = calculateBookingPrice(room, parent.currency, plan.nights, parent.quantity, rate);
    const dates = Array.from({ length: plan.nights }, (_, index) => new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10));
    const unavailable = await InventoryNight.exists({ room: room._id, date: { $in: dates }, remaining: { $lt: parent.quantity } });
    if (unavailable) throw new ExtensionError("There are not enough rooms for those extra nights. Choose another checkout date.", 409);
    return { parent, room, start, ...plan, ...price, dates };
  }

  async function emailRequest(id: string) {
    const booking = await Booking.findById(id);
    if (!booking?.parentBooking || booking.status !== "pending" || booking.holdExpiresAt <= new Date()) throw new ExtensionError("This request has expired or is no longer awaiting payment.", 409);
    const url = new URL("/booking/payment-request", deps.frontendUrl);
    // Keep the bearer token in the fragment so it is not sent in referrers or server URLs.
    url.hash = paymentRequestToken(id, deps.secret);
    const amount = new Intl.NumberFormat("en", { style: "currency", currency: booking.currency }).format(booking.totalMinor / (booking.currency === "USD" ? 100 : 1));
    const body = extensionEmail({ guestName: booking.guestName, hotelName: deps.hotelName, reference: formatBookingReference(booking.parentBooking.toString()), roomName: booking.roomName, start: booking.checkIn.toISOString().slice(0, 10), end: booking.checkOut.toISOString().slice(0, 10), nights: booking.nights, quantity: booking.quantity, amount, expires: booking.holdExpiresAt.toISOString(), url: url.href });
    await deps.sendEmail({ to: booking.guestEmail, subject: `Stay extension payment request - ${deps.hotelName}`, ...body });
    await Booking.updateOne({ _id: booking._id }, { $set: { paymentRequestEmailSent: true } });
  }

  router.post("/staff/bookings/:id/extensions/quote", deps.admin, handle(async (req, res) => {
    const parsed = input.safeParse(req.body);
    if (!parsed.success) throw new ExtensionError("Choose a new checkout date.");
    const q = await quote(req.params.id, parsed.data.checkOut);
    res.json({ quote: { checkIn: q.start.toISOString().slice(0, 10), checkOut: q.checkOut.toISOString().slice(0, 10), nights: q.nights, quantity: q.parent.quantity, currency: q.parent.currency, totalMinor: q.totalMinor } });
  }));

  router.post("/staff/bookings/:id/extensions", deps.admin, handle(async (req, res) => {
    if (!deps.emailConfigured) throw new ExtensionError("Email delivery is not configured. Configure email before requesting payment.", 503);
    const parsed = input.safeParse(req.body);
    if (!parsed.success || !parsed.data.quotedTotalMinor) throw new ExtensionError("Preview the extension price before sending it.");
    const q = await quote(req.params.id, parsed.data.checkOut);
    if (q.totalMinor !== parsed.data.quotedTotalMinor) throw new ExtensionError("The price changed. Preview the extension again before sending.", 409);
    const session = await mongoose.startSession();
    const extensionId = new mongoose.Types.ObjectId();
    try {
      await session.withTransaction(async () => {
        // Serialize requests for the same stay and recheck state inside the transaction.
        const parent = await Booking.findOneAndUpdate({ _id: q.parent._id, status: "confirmed", paymentStatus: "paid", refundRequired: { $ne: true } }, { $inc: { extensionVersion: 1 } }, { session, new: true });
        if (!parent) throw new ExtensionError("The original booking can no longer be extended.", 409);
        const pending = await Booking.exists({ parentBooking: parent._id, status: "pending" }).session(session);
        const latest = await Booking.findOne({ parentBooking: parent._id, status: "confirmed" }).sort({ checkOut: -1 }).session(session);
        if (pending || (latest?.checkOut ?? parent.checkOut).getTime() !== q.start.getTime()) throw new ExtensionError("This stay changed. Reload its details and try again.", 409);
        const locked = await Room.findOneAndUpdate({ _id: q.room._id, active: true, inventory: q.room.inventory, priceETB: q.room.priceETB, priceUSDCents: q.room.priceUSDCents }, { $inc: { inventoryVersion: 1 } }, { session, new: true });
        if (!locked) throw new ExtensionError("Room inventory or rates changed. Preview again.", 409);
        for (const date of q.dates) {
          await InventoryNight.updateOne({ room: locked._id, date }, { $setOnInsert: { remaining: locked.inventory } }, { upsert: true, session });
          const allocated = await InventoryNight.findOneAndUpdate({ room: locked._id, date, remaining: { $gte: parent.quantity } }, { $inc: { remaining: -parent.quantity } }, { session });
          if (!allocated) throw new ExtensionError("The extra nights just sold out. Choose another checkout date.", 409);
        }
        await Booking.create([{
          _id: extensionId, parentBooking: parent._id, room: parent.room, roomName: parent.roomName,
          guestName: parent.guestName, guestEmail: parent.guestEmail, guestPhone: parent.guestPhone,
          checkIn: q.start, checkOut: q.checkOut, nights: q.nights, quantity: parent.quantity, guests: parent.guests,
          currency: parent.currency, paymentGateway: parent.paymentGateway, totalMinor: q.totalMinor, usdToEtbRate: q.usdToEtbRate,
          holdExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        }], { session });
      });
    } finally { await session.endSession(); }
    let emailSent = true;
    try { await emailRequest(extensionId.toString()); }
    catch (error) { emailSent = false; console.error("Extension payment email failed:", error); }
    res.status(201).json({ id: extensionId.toString(), emailSent });
  }));

  router.post("/staff/bookings/:id/payment-request-email", deps.admin, handle(async (req, res) => {
    if (!validId(req.params.id)) throw new ExtensionError("Invalid booking reference.");
    await emailRequest(req.params.id);
    res.json({ emailSent: true });
  }));

  router.post("/guest/payment-request", deps.guestLimiter, handle(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const token = z.object({ token: z.string().min(1).max(2000) }).safeParse(req.body);
    const id = token.success ? readPaymentRequestToken(token.data.token, deps.secret) : null;
    if (!id) throw new ExtensionError("This payment link is invalid or has expired. Contact the hotel for a new request.", 404);
    const booking = await Booking.findById(id).lean();
    if (!booking?.parentBooking) throw new ExtensionError("Payment request not found.", 404);
    res.json({ booking: { id: booking._id.toString(), parentBooking: booking.parentBooking.toString(), roomName: booking.roomName, guestName: booking.guestName, guestEmail: booking.guestEmail, checkIn: booking.checkIn, checkOut: booking.checkOut, nights: booking.nights, quantity: booking.quantity, currency: booking.currency, totalMinor: booking.totalMinor, status: booking.status, paymentStatus: booking.paymentStatus, holdExpiresAt: booking.holdExpiresAt } });
  }));
  return router;
}
