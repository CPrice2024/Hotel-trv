import { Router, type RequestHandler } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { Booking, InventoryNight, Room, User } from "./db/models.js";

const wrap = (handler: RequestHandler): RequestHandler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};
const idInput = z.string().regex(/^[a-f\d]{24}$/i);
const roomDetails = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().min(5).max(1000),
  imageUrl: z.union([z.string().url().max(1000), z.literal("")]),
  inventory: z.number().int().min(1).max(500),
  maxGuests: z.number().int().min(1).max(12),
  priceETB: z.number().int().min(0).max(100_000_000),
  priceUSD: z.number().min(0.5).max(1_000_000).multipleOf(0.01),
  active: z.boolean(),
  testOnly: z.boolean(),
});
const listInput = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).default(""),
  status: z.enum(["", "pending", "confirmed", "cancelled", "completed"]).default(""),
  payment: z.enum(["", "unpaid", "paid", "failed"]).default(""),
  currency: z.enum(["", "ETB", "USD"]).default(""),
  email: z.string().email().optional(),
}).strict();
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function createAdminRouter(authorize: (roles?: ("admin" | "staff")[]) => RequestHandler) {
  const router = Router();
  router.use(authorize());

  router.get("/bookings", wrap(async (req, res) => {
    const parsed = listInput.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: "Invalid search or page filters." }); return; }
    const { page, limit, search, status, payment, currency, email } = parsed.data;
    const filter = {
      ...(status ? { status } : {}), ...(payment ? { paymentStatus: payment } : {}),
      ...(currency ? { currency } : {}), ...(email ? { guestEmail: email.toLowerCase() } : {}),
      ...(search ? { $or: ["guestName", "guestEmail", "roomName", "guestPhone"].map(field => ({ [field]: { $regex: escape(search), $options: "i" } })) } : {}),
    };
    const [total, bookings] = await Promise.all([
      Booking.countDocuments(filter), Booking.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ]);
    res.json({ total, page, pages: Math.max(1, Math.ceil(total / limit)), bookings: bookings.map(b => ({ ...b, id: b._id.toString() })) });
  }));

  router.get("/bookings/:id", wrap(async (req, res) => {
    if (!idInput.safeParse(req.params.id).success) { res.status(400).json({ error: "Invalid booking identifier." }); return; }
    const booking = await Booking.findById(req.params.id).lean();
    if (!booking) { res.status(404).json({ error: "Booking not found." }); return; }
    res.json({ booking: { ...booking, id: booking._id.toString() } });
  }));

  router.put("/rooms/:id", authorize(["admin"]), wrap(async (req, res) => {
    const parsed = roomDetails.safeParse(req.body);
    if (!idInput.safeParse(req.params.id).success || !parsed.success) { res.status(400).json({ error: "Check the room details, inventory, and prices." }); return; }
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // Both booking holds and edits write this document before touching inventory.
        const room = await Room.findByIdAndUpdate(req.params.id, { $inc: { inventoryVersion: 1 } }, { session, new: true });
        if (!room) throw new Error("ROOM_NOT_FOUND");
          const inventoryDelta = parsed.data.inventory - room.inventory;
          if (inventoryDelta !== 0) {
            // Preserve booked quantities while applying capacity changes to every stored night.
            if (inventoryDelta < 0 && await InventoryNight.exists({ room: room._id, remaining: { $lt: -inventoryDelta } }).session(session)) {
              throw new Error("INVENTORY_ALLOCATED");
            }
            await InventoryNight.updateMany({ room: room._id }, { $inc: { remaining: inventoryDelta } }, { session });
        }
        const { priceUSD, ...details } = parsed.data;
        room.set({ ...details, priceUSDCents: Math.round(priceUSD * 100) });
        await room.save({ session });
      });
    } catch (error) {
      if (error instanceof Error && error.message === "ROOM_NOT_FOUND") { res.status(404).json({ error: "Room not found." }); return; }
      if (error instanceof Error && error.message === "INVENTORY_ALLOCATED") { res.status(409).json({ error: "Capacity cannot be reduced below the rooms already reserved on a night. Choose a higher room count or cancel those reservations first." }); return; }
      throw error;
    } finally { await session.endSession(); }
    res.json({ message: "Room details saved." });
  }));

  router.get("/guests", wrap(async (req, res) => {
    const parsed = listInput.pick({ page: true, limit: true, search: true }).safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: "Invalid guest filters." }); return; }
    const { page, limit, search } = parsed.data;
    const rows = await Booking.aggregate([
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$guestEmail", name: { $first: "$guestName" }, phone: { $first: "$guestPhone" }, bookings: { $sum: 1 }, latestStay: { $max: "$checkIn" } } },
      ...(search ? [{ $match: { $or: ["name", "_id", "phone"].map(field => ({ [field]: { $regex: escape(search), $options: "i" } })) } }] : []),
      { $sort: { latestStay: -1, _id: 1 } },
      { $facet: { guests: [{ $skip: (page - 1) * limit }, { $limit: limit }], total: [{ $count: "value" }] } },
    ]);
    const total = rows[0]?.total[0]?.value ?? 0;
    res.json({ guests: rows[0]?.guests ?? [], total, pages: Math.max(1, Math.ceil(total / limit)) });
  }));

  router.get("/reports", wrap(async (req, res) => {
    const parsed = z.object({ days: z.coerce.number().int().min(1).max(366).default(30) }).safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: "Choose a report period between 1 and 366 days." }); return; }
    const since = new Date(); since.setUTCHours(0, 0, 0, 0); since.setUTCDate(since.getUTCDate() - parsed.data.days + 1);
    const [statuses, revenue, totals, rooms] = await Promise.all([
      Booking.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      Booking.aggregate([{ $match: { paymentStatus: "paid", createdAt: { $gte: since } } }, { $group: { _id: { currency: "$currency", date: { $dateToString: { date: "$createdAt", format: "%Y-%m-%d", timezone: "UTC" } } }, amount: { $sum: "$totalMinor" }, count: { $sum: 1 } } }, { $sort: { "_id.date": 1 } }]),
      Booking.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: "$currency", bookings: { $sum: 1 }, paid: { $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, "$totalMinor", 0] } }, refundRequired: { $sum: { $cond: ["$refundRequired", 1, 0] } } } }]),
      Room.aggregate([{ $group: { _id: null, types: { $sum: 1 }, inventory: { $sum: "$inventory" }, published: { $sum: { $cond: [{ $and: ["$active", { $ne: ["$testOnly", true] }] }, 1, 0] } } } }]),
    ]);
    res.json({ days: parsed.data.days, since, statuses, revenue, totals, rooms: rooms[0] ?? { types: 0, inventory: 0, published: 0 } });
  }));

  router.get("/users", authorize(["admin"]), wrap(async (_req, res) => {
    const users = await User.find().select("name email role active createdAt").sort({ createdAt: -1 }).lean();
    res.json({ users: users.map(user => ({ ...user, id: user._id.toString(), current: user._id.toString() === res.locals.staff.id })) });
  }));

  router.patch("/users/:id", authorize(["admin"]), wrap(async (req, res) => {
    const parsed = z.object({ active: z.boolean() }).safeParse(req.body);
    if (!parsed.success || !idInput.safeParse(req.params.id).success) { res.status(400).json({ error: "Invalid account update." }); return; }
    // Administrator access is protected. Administrators can suspend and restore staff accounts.
    const user = await User.findOneAndUpdate({ _id: req.params.id, role: "staff" }, { $set: parsed.data }, { new: true }).select("name email role active");
    if (!user) { res.status(409).json({ error: "Only staff accounts can be suspended or restored here. Administrator accounts are protected." }); return; }
    res.json({ user });
  }));
  return router;
}
