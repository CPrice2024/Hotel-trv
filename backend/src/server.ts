import "dotenv/config";
import argon2 from "argon2";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose, {
  type ClientSession,
  type HydratedDocument,
  type Types,
} from "mongoose";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import Stripe from "stripe";
import { z } from "zod";
import { connectDatabase, disconnectDatabase } from "./db/connection.js";
import { calculateBookingPrice } from "./db/bookingPricing.js";
import { createChapaReference } from "./lib/bookingReference.js";
import { Booking, InventoryNight, Room, User } from "./db/models.js";
import type { BookingRecord } from "./db/models.js";

const port = Number(process.env.PORT ?? 4000);
const frontendUrl = (process.env.FRONTEND_URL ?? "http://localhost:5173").replace(
  /\/$/,
  "",
);
const jwtSecret = process.env.JWT_SECRET;
const hotelName = process.env.HOTEL_NAME ?? "Ayele Degu International Hotel";
const contactEmail = process.env.HOTEL_EMAIL ?? "";
const contactPhone = process.env.HOTEL_PHONE ?? "";
const hotelAddress = process.env.HOTEL_ADDRESS ?? "";
const hotelLatitudeValue = process.env.HOTEL_LATITUDE?.trim() || "6.4083";
const hotelLongitudeValue = process.env.HOTEL_LONGITUDE?.trim() || "38.3104";
const hotelLatitude = hotelLatitudeValue ? Number(hotelLatitudeValue) : Number.NaN;
const hotelLongitude = hotelLongitudeValue ? Number(hotelLongitudeValue) : Number.NaN;
const hotelCoordinates =
  Number.isFinite(hotelLatitude) &&
  hotelLatitude >= -90 &&
  hotelLatitude <= 90 &&
  Number.isFinite(hotelLongitude) &&
  hotelLongitude >= -180 &&
  hotelLongitude <= 180
    ? { latitude: hotelLatitude, longitude: hotelLongitude }
    : null;
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
const googleAuthClient = googleClientId ? new OAuth2Client(googleClientId) : null;
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const emailTransport =
  process.env.SMTP_HOST && process.env.SMTP_FROM
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === "true",
        auth:
          process.env.SMTP_USER && process.env.SMTP_PASSWORD
            ? {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD,
              }
            : undefined,
      })
    : null;
const emailDeliveryConfigured = Boolean(
  (resend && process.env.RESEND_FROM_EMAIL) ||
    (emailTransport && process.env.SMTP_FROM),
);

async function sendEmail({
  to,
  replyTo,
  subject,
  text,
}: {
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
}): Promise<void> {
  if (resend && process.env.RESEND_FROM_EMAIL) {
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: [to],
      replyTo,
      subject,
      text,
    });
    if (error) {
      throw new Error(`Resend email delivery failed: ${error.message}`);
    }
    return;
  }
  if (!emailTransport || !process.env.SMTP_FROM) {
    throw new Error("Email delivery is not configured. Set SMTP_HOST/SMTP_FROM or RESEND_API_KEY/RESEND_FROM_EMAIL.");
  }
  await emailTransport.sendMail({
    from: process.env.SMTP_FROM,
    to,
    ...(replyTo ? { replyTo } : {}),
    subject,
    text,
  });
}

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be set to a secret of at least 32 characters.");
}

const app = express();
const cookieName = "hotel_session";
const isProduction = process.env.NODE_ENV === "production";
const currencyFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many booking attempts. Please wait and try again." },
});

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const googleIdentityLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many Google sign-in attempts. Please wait and try again." },
});

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(
  helmet({
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    contentSecurityPolicy: {
      directives: {
        imgSrc: ["'self'", "data:", "blob:", "https://images.unsplash.com", "https://ayeledeguinthotel.com", "https://*.tile.openstreetmap.org"],
        scriptSrc: ["'self'", "https://accounts.google.com/gsi/client"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        connectSrc: [
          "'self'",
          "https://api.chapa.co",
          "https://api.stripe.com",
          "https://accounts.google.com",
          "https://oauth2.googleapis.com",
          "https://open.er-api.com",
          "https://nominatim.openstreetmap.org",
          "https://router.project-osrm.org",
        ],
        frameSrc: ["https://accounts.google.com", "https://www.google.com"],
      },
    },
  }),
);
app.use(
  cors({
    origin: frontendUrl,
    credentials: true,
  }),
);
app.use((request, response, next) => {
  const parseBody =
    request.path === "/api/payments/stripe/webhook"
      ? express.raw({ type: "application/json", limit: "1mb" })
      : express.json({ limit: "32kb" });
  parseBody(request, response, next);
});
app.use(cookieParser());

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Try again later." },
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const guestBookingLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many booking lookups. Please wait and try again." },
});

type StaffClaims = {
  id: string;
  role: "admin" | "staff";
};

function requireStaff(roles: StaffClaims["role"][] = ["admin", "staff"]): RequestHandler {
  return async (_request, response, next) => {
    try {
      if (!jwtSecret) {
        response.status(500).json({ error: "Authentication is not configured." });
        return;
      }
      const token = _request.cookies?.[cookieName] as string | undefined;
      if (!token) {
        response.status(401).json({ error: "Please sign in to continue." });
        return;
      }
      const decoded = jwt.verify(token, jwtSecret, {
        issuer: "ayele-hotel",
        audience: "ayele-hotel-staff",
      });
      if (typeof decoded === "string" || !decoded.sub) {
        response.status(401).json({ error: "Your session is invalid. Please sign in again." });
        return;
      }
      const staff = await User.findOne({
        _id: decoded.sub,
        active: true,
      }).select("_id role");
      if (!staff || !roles.includes(staff.role as StaffClaims["role"])) {
        response.status(403).json({ error: "You do not have permission for this action." });
        return;
      }
      response.locals.staff = {
        id: staff._id.toString(),
        role: staff.role,
      } satisfies StaffClaims;
      next();
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        response.status(401).json({ error: "Your session has expired. Please sign in again." });
        return;
      }
      next(error);
    }
  };
}

const asyncRoute =
  (handler: (request: Request, response: Response) => Promise<void>): RequestHandler =>
  (request, response, next) => {
    void handler(request, response).catch(next);
  };

const isValidObjectId = (value: string): boolean => mongoose.isValidObjectId(value);

function dayFromInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

function nightsBetween(checkIn: Date, checkOut: Date): string[] {
  const nights: string[] = [];
  for (
    let current = new Date(checkIn);
    current < checkOut;
    current.setUTCDate(current.getUTCDate() + 1)
  ) {
    nights.push(current.toISOString().slice(0, 10));
  }
  return nights;
}

async function getLiveUsdToEtbRate(): Promise<{
  rate: number;
  updatedAt: Date;
}> {
  const response = await fetch("https://open.er-api.com/v6/latest/USD", {
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw new Error(`Exchange-rate service responded with ${response.status}.`);
  }

  const result = z
    .object({
      result: z.literal("success"),
      time_last_update_utc: z.string().min(1),
      rates: z.object({ ETB: z.number().finite().positive() }),
    })
    .safeParse(await response.json());
  if (!result.success) {
    throw new Error("Exchange-rate service returned invalid Birr pricing.");
  }

  const updatedAt = new Date(result.data.time_last_update_utc);
  const age = Date.now() - updatedAt.getTime();
  if (
    Number.isNaN(updatedAt.getTime()) ||
    age > 48 * 60 * 60 * 1000 ||
    age < -5 * 60 * 1000
  ) {
    throw new Error("Exchange-rate service returned an outdated or invalid rate.");
  }

  return { rate: result.data.rates.ETB, updatedAt };
}

function getFrontendUrl(path: string): string {
  return `${frontendUrl}${path}`;
}

function sendPaymentRedirect(response: Response, status: string, bookingId: string): void {
  response.redirect(
    getFrontendUrl(
      `/booking/result?status=${encodeURIComponent(status)}&booking=${encodeURIComponent(bookingId)}`,
    ),
  );
}

async function releaseInventory(
  booking: {
    room: Types.ObjectId;
    checkIn: Date;
    checkOut: Date;
    quantity: number;
  },
  session: ClientSession,
): Promise<void> {
  for (const date of nightsBetween(booking.checkIn, booking.checkOut)) {
    await InventoryNight.updateOne(
      { room: booking.room, date },
      { $inc: { remaining: booking.quantity } },
      { session },
    );
  }
}

async function confirmPaidBooking(
  bookingId: string,
  paymentReference: string,
  duplicatePayment = false,
): Promise<string | null> {
  const session = await mongoose.startSession();
  let guestEmail: string | null = null;
  let paymentRequiresRefund = false;
  try {
    await session.withTransaction(async () => {
      const booking = await Booking.findById(bookingId).session(session);
      if (!booking || booking.paymentStatus === "paid") {
        if (booking?.status === "confirmed") {
          if (booking.paymentReference !== paymentReference || duplicatePayment) {
            booking.refundRequired = true;
            await booking.save({ session });
          }
          paymentRequiresRefund = booking.refundRequired;
          guestEmail = booking.guestEmail;
        } else if (booking) {
          paymentRequiresRefund = booking.refundRequired;
        }
        return;
      }
      if (booking.status === "cancelled") {
        booking.paymentStatus = "paid";
        booking.refundRequired = true;
        booking.paymentReference = paymentReference;
        await booking.save({ session });
        paymentRequiresRefund = true;
        return;
      }
      booking.paymentStatus = "paid";
      booking.status = "confirmed";
      booking.refundRequired = duplicatePayment;
      booking.paymentReference = paymentReference;
      await booking.save({ session });
      paymentRequiresRefund = duplicatePayment;
      guestEmail = booking.guestEmail;
    });
  } finally {
    await session.endSession();
  }
  return paymentRequiresRefund ? null : guestEmail;
}

async function sendBookingConfirmation(bookingId: string): Promise<void> {
  const sendingAt = new Date();
  const booking = await Booking.findOneAndUpdate(
    {
      _id: bookingId,
      status: "confirmed",
      paymentStatus: "paid",
      confirmationEmailSent: false,
      $or: [
        { confirmationEmailSendingAt: { $exists: false } },
        { confirmationEmailSendingAt: null },
        { confirmationEmailSendingAt: { $lte: new Date(Date.now() - 5 * 60 * 1000) } },
      ],
    },
    { $set: { confirmationEmailSendingAt: sendingAt } },
    { new: true },
  );
  if (!booking) {
    return;
  }
  const total = currencyFormatter.format(
    booking.currency === "USD" ? booking.totalMinor / 100 : booking.totalMinor,
  );
  const nightlyRate = currencyFormatter.format(
    booking.totalMinor /
      booking.nights /
      booking.quantity /
      (booking.currency === "USD" ? 100 : 1),
  );
  const details = [
    `Booking reference: ${booking._id.toString()}`,
    `Booking status: Confirmed`,
    `Payment status: Paid via ${booking.paymentGateway === "chapa" ? "Chapa" : "Stripe"}`,
    ...(booking.paymentReference ? [`Payment reference: ${booking.paymentReference}`] : []),
    "",
    "Guest details",
    `Name: ${booking.guestName}`,
    `Email: ${booking.guestEmail}`,
    `Phone: ${booking.guestPhone}`,
    "",
    "Stay details",
    `Room type: ${booking.roomName}`,
    `Rooms: ${booking.quantity}`,
    `Guests: ${booking.guests}`,
    `Check-in: ${booking.checkIn.toISOString().slice(0, 10)}`,
    `Check-out: ${booking.checkOut.toISOString().slice(0, 10)}`,
    `Nights: ${booking.nights}`,
    `Rate per room per night: ${booking.currency} ${nightlyRate}`,
    `Total paid: ${booking.currency} ${total}`,
  ];
  const hotelContact = [
    `Hotel: ${hotelName}`,
    ...(hotelAddress ? [`Address: ${hotelAddress}`] : []),
    ...(contactPhone ? [`Phone: ${contactPhone}`] : []),
    ...(contactEmail ? [`Email: ${contactEmail}`] : []),
  ];
  try {
    await sendEmail({
      to: booking.guestEmail,
      replyTo: contactEmail || undefined,
      subject: `Booking confirmed — ${hotelName}`,
      text: [
        `Hello ${booking.guestName},`,
        "",
        `Your paid reservation at ${hotelName} is confirmed.`,
        "",
        ...details,
        "",
        ...hotelContact,
        "",
        "Thank you for booking with us.",
      ].join("\n"),
    });
    await Booking.updateOne(
      { _id: bookingId, confirmationEmailSent: false },
      {
        $set: { confirmationEmailSent: true },
        $unset: { confirmationEmailSendingAt: 1 },
      },
    );
  } catch (error) {
    await Booking.updateOne(
      { _id: bookingId, confirmationEmailSendingAt: sendingAt },
      { $unset: { confirmationEmailSendingAt: 1 } },
    );
    throw error;
  }
}

async function ensureInitialAdmin(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    console.warn("Staff sign-in is not initialized; set ADMIN_EMAIL and ADMIN_PASSWORD.");
    return;
  }
  if (adminPassword.length < 12) {
    console.error(
      "Staff sign-in is not initialized: ADMIN_PASSWORD must contain at least 12 characters.",
    );
    return;
  }
  const existingUser = await User.findOne({ email: adminEmail });
  if (existingUser) {
    return;
  }
  await User.create({
    name: process.env.ADMIN_NAME ?? "Hotel Administrator",
    email: adminEmail,
    passwordHash: await argon2.hash(adminPassword, { type: argon2.argon2id }),
    role: "admin",
  });
  console.info(`Initial hotel administrator created for ${adminEmail}.`);
}

async function expirePendingBookings(): Promise<void> {
  const expired = await Booking.find({
    status: "pending",
    paymentStatus: "unpaid",
    holdExpiresAt: { $lte: new Date() },
  }).limit(50);
  for (const booking of expired) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const current = await Booking.findOneAndUpdate(
          {
            _id: booking._id,
            status: "pending",
            paymentStatus: "unpaid",
            holdExpiresAt: { $lte: new Date() },
          },
          { $set: { status: "cancelled" } },
          { new: true, session },
        );
        if (current) {
          await releaseInventory(current, session);
        }
      });
    } finally {
      await session.endSession();
    }
  }
}

async function retryBookingConfirmationEmails(): Promise<void> {
  if (!emailDeliveryConfigured) {
    return;
  }
  const bookings = await Booking.find({
    status: "confirmed",
    paymentStatus: "paid",
    confirmationEmailSent: false,
  })
    .select("_id")
    .limit(10);
  for (const booking of bookings) {
    try {
      await sendBookingConfirmation(booking._id.toString());
    } catch (error) {
      console.error("Booking confirmation email retry failed:", error);
    }
  }
}

app.get("/api/health", (_request, response) => {
  const database = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  response.status(database === "connected" ? 200 : 503).json({
    status: database === "connected" ? "ok" : "degraded",
    database,
  });
});

app.get("/api/public/config", (_request, response) => {
  response.json({
    name: hotelName,
    email: contactEmail,
    phone: contactPhone,
    address: hotelAddress,
    location: hotelCoordinates,
    directionsUrl: hotelAddress
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(hotelAddress)}`
      : "",
    paymentMethods: {
      chapa: Boolean(process.env.CHAPA_SECRET_KEY),
      stripe: Boolean(stripe && stripeWebhookSecret),
    },
    authenticationMethods: { google: Boolean(googleAuthClient), googleClientId },
  });
});

app.post(
  "/api/guest/google/verify",
  googleIdentityLimiter,
  asyncRoute(async (request, response) => {
    const input = z
      .object({ credential: z.string().min(100).max(10_000) })
      .safeParse(request.body);
    if (!input.success) {
      response.status(400).json({ error: "A valid Google credential is required." });
      return;
    }
    if (!googleAuthClient) {
      response.status(503).json({ error: "Google sign-in is not configured." });
      return;
    }

    try {
      const ticket = await googleAuthClient.verifyIdToken({
        idToken: input.data.credential,
        audience: googleClientId,
      });
      const payload = ticket.getPayload();
      if (
        !payload?.email ||
        payload.email_verified !== true
      ) {
        response.status(401).json({ error: "Google did not provide a verified email address." });
        return;
      }
      response.json({
        email: payload.email.toLowerCase(),
        name: payload.name?.trim() ?? "",
      });
    } catch {
      response.status(401).json({ error: "Google authentication could not be verified." });
    }
  }),
);

app.get(
  "/api/rooms",
  asyncRoute(async (_request, response) => {
    const rooms = await Room.find({
      active: true,
      ...(process.env.NODE_ENV === "production" ? { testOnly: { $ne: true } } : {}),
    })
      .select("name description imageUrl inventory maxGuests priceETB priceUSDCents testOnly")
      .sort({ name: 1 })
      .lean();
    response.json({
      rooms: rooms.map((room) => ({
        ...room,
        id: room._id.toString(),
        priceUSD: room.priceUSDCents / 100,
      })),
    });
  }),
);

app.post(
  "/api/staff/login",
  loginLimiter,
  asyncRoute(async (request, response) => {
    const input = z
      .object({
        email: z.string().email().max(254),
        password: z.string().min(1).max(200),
      })
      .safeParse(request.body);
    if (!input.success) {
      response.status(400).json({ error: "Enter a valid email and password." });
      return;
    }
    const user = await User.findOne({
      email: input.data.email.toLowerCase(),
      active: true,
    });
    if (!user || !(await argon2.verify(user.passwordHash, input.data.password))) {
      response.status(401).json({ error: "Email or password is incorrect." });
      return;
    }
    if (!jwtSecret) {
      response.status(500).json({ error: "Authentication is not configured." });
      return;
    }
    const token = jwt.sign({ role: user.role }, jwtSecret, {
      subject: user._id.toString(),
      expiresIn: "8h",
      issuer: "ayele-hotel",
      audience: "ayele-hotel-staff",
    });
    response.cookie(cookieName, token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      maxAge: 8 * 60 * 60 * 1000,
      path: "/",
    });
    response.json({ user: { name: user.name, email: user.email, role: user.role } });
  }),
);

app.post("/api/staff/logout", (_request, response) => {
  response.clearCookie(cookieName, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
  });
  response.status(204).end();
});

app.get(
  "/api/staff/me",
  requireStaff(),
  asyncRoute(async (_request, response) => {
    const user = await User.findById(response.locals.staff.id).select("name email role");
    if (!user) {
      response.status(401).json({ error: "Staff account no longer exists." });
      return;
    }
    response.json({ user });
  }),
);

app.get(
  "/api/staff/dashboard",
  requireStaff(),
  asyncRoute(async (_request, response) => {
    const [roomCount, bookingCount, paidBookings, pendingCount, latestBookings] =
      await Promise.all([
        Room.countDocuments({ active: true }),
        Booking.countDocuments(),
        Booking.find({ paymentStatus: "paid" }).select("currency totalMinor"),
        Booking.countDocuments({ status: "pending", holdExpiresAt: { $gt: new Date() } }),
        Booking.find().sort({ createdAt: -1 }).limit(50).lean(),
      ]);
    const revenue = paidBookings.reduce(
      (totals, booking) => {
        totals[booking.currency] =
          (totals[booking.currency] ?? 0) + booking.totalMinor;
        return totals;
      },
      {} as Record<string, number>,
    );
    response.json({
      metrics: {
        activeRooms: roomCount,
        bookings: bookingCount,
        pending: pendingCount,
        revenueETB: revenue.ETB ?? 0,
        revenueUSD: (revenue.USD ?? 0) / 100,
      },
      bookings: latestBookings.map((booking) => ({
        ...booking,
        id: booking._id.toString(),
      })),
    });
  }),
);

app.get(
  "/api/staff/rooms",
  requireStaff(),
  asyncRoute(async (_request, response) => {
    const rooms = await Room.find().sort({ createdAt: -1 }).lean();
    response.json({
      rooms: rooms.map((room) => ({
        ...room,
        id: room._id.toString(),
        priceUSD: room.priceUSDCents / 100,
      })),
    });
  }),
);

const roomInput = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().min(5).max(1000),
  imageUrl: z.union([z.string().url().max(1000), z.literal("")]).default(""),
  inventory: z.number().int().min(1).max(500),
  maxGuests: z.number().int().min(1).max(12),
  priceETB: z.number().int().min(0).max(100_000_000),
  priceUSD: z.number().min(0.5).max(1_000_000).multipleOf(0.01),
});

app.post(
  "/api/staff/rooms",
  requireStaff(["admin"]),
  asyncRoute(async (request, response) => {
    const input = roomInput.safeParse(request.body);
    if (!input.success) {
      response.status(400).json({ error: "Check the room details and prices." });
      return;
    }
    const room = await Room.create({
      ...input.data,
      priceUSDCents: Math.round(input.data.priceUSD * 100),
      testOnly: false,
    });
    response.status(201).json({ room });
  }),
);

app.patch(
  "/api/staff/rooms/:id",
  requireStaff(["admin"]),
  asyncRoute(async (request, response) => {
    const roomId = request.params.id;
    if (typeof roomId !== "string" || !isValidObjectId(roomId)) {
      response.status(400).json({ error: "Invalid room identifier." });
      return;
    }
    const input = z.object({ active: z.boolean() }).safeParse(request.body);
    if (!input.success) {
      response.status(400).json({ error: "Provide the room active status." });
      return;
    }
    const room = await Room.findByIdAndUpdate(
      roomId,
      { $set: input.data },
      { new: true, runValidators: true },
    );
    if (!room) {
      response.status(404).json({ error: "Room not found." });
      return;
    }
    response.json({ room });
  }),
);

app.post(
  "/api/staff/users",
  requireStaff(["admin"]),
  asyncRoute(async (request, response) => {
    const input = z
      .object({
        name: z.string().trim().min(2).max(100),
        email: z.string().email().max(254),
        password: z.string().min(12).max(200),
        role: z.enum(["admin", "staff"]),
      })
      .safeParse(request.body);
    if (!input.success) {
      response.status(400).json({ error: "Check the staff account details." });
      return;
    }
    const email = input.data.email.toLowerCase();
    if (await User.exists({ email })) {
      response.status(409).json({ error: "A staff account already uses that email." });
      return;
    }
    const user = await User.create({
      name: input.data.name,
      email,
      role: input.data.role,
      passwordHash: await argon2.hash(input.data.password, {
        type: argon2.argon2id,
      }),
    });
    response.status(201).json({
      user: { name: user.name, email: user.email, role: user.role },
    });
  }),
);

app.patch(
  "/api/staff/bookings/:id/cancel",
  requireStaff(),
  asyncRoute(async (request, response) => {
    const bookingId = request.params.id;
    if (typeof bookingId !== "string" || !isValidObjectId(bookingId)) {
      response.status(400).json({ error: "Invalid booking identifier." });
      return;
    }
    const session = await mongoose.startSession();
    let result: { status: number; message: string } = {
      status: 404,
      message: "Booking not found.",
    };
    try {
      await session.withTransaction(async () => {
        const booking = await Booking.findById(bookingId).session(session);
        if (!booking) {
          return;
        }
        if (booking.paymentStatus === "paid") {
          result = {
            status: 409,
            message: "Paid bookings need a payment refund before cancellation.",
          };
          return;
        }
        if (booking.paymentReference && booking.holdExpiresAt > new Date()) {
          result = {
            status: 409,
            message: "A payment session is active. Wait for it to expire before cancelling.",
          };
          return;
        }
        if (booking.status === "cancelled") {
          result = { status: 200, message: "Booking is already cancelled." };
          return;
        }
        await releaseInventory(booking, session);
        booking.status = "cancelled";
        await booking.save({ session });
        result = { status: 200, message: "Booking cancelled and inventory released." };
      });
    } finally {
      await session.endSession();
    }
    response.status(result.status).json({ message: result.message });
  }),
);

const bookingInput = z.object({
  roomId: z.string().min(1),
  checkIn: z.string(),
  checkOut: z.string(),
  quantity: z.number().int().min(1).max(10),
  guests: z.number().int().min(1).max(20),
  guestName: z.string().trim().min(2).max(100),
  guestEmail: z.string().email().max(254),
  guestPhone: z.string().trim().min(7).max(30),
  currency: z.enum(["ETB", "USD"]),
});

app.post(
  "/api/bookings",
  bookingLimiter,
  asyncRoute(async (request, response) => {
    const input = bookingInput.safeParse(request.body);
    if (!input.success) {
      response.status(400).json({ error: "Check your booking details and try again." });
      return;
    }
    if (!isValidObjectId(input.data.roomId)) {
      response.status(400).json({ error: "Choose a valid room type." });
      return;
    }
    const checkIn = dayFromInput(input.data.checkIn);
    const checkOut = dayFromInput(input.data.checkOut);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (!checkIn || !checkOut || checkIn < today || checkOut <= checkIn) {
      response.status(400).json({ error: "Choose valid future check-in and check-out dates." });
      return;
    }
    const nights = nightsBetween(checkIn, checkOut);
    if (nights.length > 60) {
      response.status(400).json({ error: "A stay cannot exceed 60 nights." });
      return;
    }
    const room = await Room.findOne({
      _id: input.data.roomId,
      active: true,
      ...(process.env.NODE_ENV === "production" ? { testOnly: { $ne: true } } : {}),
    });
    if (!room) {
      response.status(404).json({ error: "That room type is not available." });
      return;
    }
    if (input.data.guests > room.maxGuests * input.data.quantity) {
      response.status(400).json({
        error: `This room can accommodate up to ${room.maxGuests} guests per room.`,
      });
      return;
    }
    const currency = input.data.currency;
    let exchangeRate: Awaited<ReturnType<typeof getLiveUsdToEtbRate>> | null = null;
    if (currency === "ETB" && room.priceETB === 0) {
      try {
        exchangeRate = await getLiveUsdToEtbRate();
      } catch (error) {
        console.error("Live Birr pricing is unavailable:", error);
        response.status(503).json({
          error: "Live Birr pricing is temporarily unavailable. Please retry shortly.",
        });
        return;
      }
    }
    const { totalMinor, usdToEtbRate } = calculateBookingPrice(
      room,
      currency,
      nights.length,
      input.data.quantity,
      exchangeRate?.rate,
    );
    const session = await mongoose.startSession();
    const bookingHolder: { created: HydratedDocument<BookingRecord> | null } = {
      created: null,
    };
    try {
      await session.withTransaction(async () => {
        for (const date of nights) {
          await InventoryNight.updateOne(
            { room: room._id, date },
            { $setOnInsert: { remaining: room.inventory } },
            { upsert: true, session },
          );
          const inventory = await InventoryNight.findOneAndUpdate(
            { room: room._id, date, remaining: { $gte: input.data.quantity } },
            { $inc: { remaining: -input.data.quantity } },
            { new: true, session },
          );
          if (!inventory) {
            throw new Error("ROOMS_UNAVAILABLE");
          }
        }
        const [booking] = await Booking.create(
          [
            {
              room: room._id,
              roomName: room.name,
              guestName: input.data.guestName,
              guestEmail: input.data.guestEmail.toLowerCase(),
              guestPhone: input.data.guestPhone,
              checkIn,
              checkOut,
              nights: nights.length,
              quantity: input.data.quantity,
              guests: input.data.guests,
              currency,
              totalMinor,
              usdToEtbRate,
              paymentGateway: currency === "ETB" ? "chapa" : "stripe",
              holdExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
            },
          ],
          { session },
        );
        bookingHolder.created = booking;
      });
    } catch (error) {
      if (error instanceof Error && error.message === "ROOMS_UNAVAILABLE") {
        response.status(409).json({ error: "Those dates just sold out. Choose other dates." });
        return;
      }
      throw error;
    } finally {
      await session.endSession();
    }
    const createdBooking = bookingHolder.created;
    if (!createdBooking) {
      response.status(500).json({ error: "The booking could not be created." });
      return;
    }
    response.status(201).json({
      booking: {
        id: createdBooking._id.toString(),
        roomName: createdBooking.roomName,
        checkIn: createdBooking.checkIn,
        checkOut: createdBooking.checkOut,
        nights: createdBooking.nights,
        quantity: createdBooking.quantity,
        currency: createdBooking.currency,
        total: currency === "USD" ? totalMinor / 100 : totalMinor,
        usdToEtbRate: createdBooking.usdToEtbRate,
        holdExpiresAt: createdBooking.holdExpiresAt,
      },
    });
  }),
);

app.post(
  "/api/guest/bookings/lookup",
  guestBookingLookupLimiter,
  asyncRoute(async (request, response) => {
    const input = z
      .object({
        bookingId: z.string().min(1).max(64),
        guestEmail: z.string().email().max(254),
      })
      .safeParse(request.body);

    if (!input.success || !isValidObjectId(input.data.bookingId)) {
      response.status(404).json({ error: "Booking not found. Check the reference and email address." });
      return;
    }

    const booking = await Booking.findOne({
      _id: input.data.bookingId,
      guestEmail: input.data.guestEmail.trim().toLowerCase(),
    }).select(
      "_id roomName guestName guestEmail guestPhone checkIn checkOut nights quantity guests currency totalMinor usdToEtbRate paymentGateway paymentStatus paymentReference status",
    );

    if (!booking) {
      response.status(404).json({ error: "Booking not found. Check the reference and email address." });
      return;
    }

    response.json({
      booking: {
        id: booking._id.toString(),
        roomName: booking.roomName,
        guestName: booking.guestName,
        guestEmail: booking.guestEmail,
        guestPhone: booking.guestPhone,
        checkIn: booking.checkIn.toISOString().slice(0, 10),
        checkOut: booking.checkOut.toISOString().slice(0, 10),
        nights: booking.nights,
        quantity: booking.quantity,
        guests: booking.guests,
        currency: booking.currency,
        total: booking.currency === "USD" ? booking.totalMinor / 100 : booking.totalMinor,
        usdToEtbRate: booking.usdToEtbRate ?? null,
        paymentGateway: booking.paymentGateway,
        paymentStatus: booking.paymentStatus,
        paymentReference:
          booking.paymentStatus === "paid" ? booking.paymentReference : "",
        status: booking.status,
      },
    });
  }),
);

app.post(
  "/api/payments/checkout",
  paymentLimiter,
  asyncRoute(async (request, response) => {
    const input = z
      .object({
        bookingId: z.string().min(1),
        guestEmail: z.string().email().max(254),
      })
      .safeParse(request.body);
    if (!input.success || !isValidObjectId(input.data.bookingId)) {
      response.status(400).json({ error: "Invalid booking checkout request." });
      return;
    }
    const booking = await Booking.findById(input.data.bookingId);
    if (
      !booking ||
      booking.guestEmail !== input.data.guestEmail.toLowerCase() ||
      booking.status !== "pending" ||
      booking.holdExpiresAt <= new Date()
    ) {
      response.status(404).json({ error: "Booking not found or its payment hold expired." });
      return;
    }
    if (booking.currency === "USD") {
      if (!stripe || !stripeWebhookSecret) {
        response.status(503).json({
          error: "Stripe payments require both the API key and webhook signing secret.",
        });
        return;
      }
      if (booking.paymentReference) {
        const existingCheckout = await stripe.checkout.sessions.retrieve(
          booking.paymentReference,
        );
        if (existingCheckout.status === "open" && existingCheckout.url) {
          response.json({ checkoutUrl: existingCheckout.url });
          return;
        }
        if (
          existingCheckout.metadata?.bookingId === booking._id.toString() &&
          existingCheckout.payment_status === "paid"
        ) {
          await settleStripePayment(existingCheckout);
          response.status(409).json({
            error: "This booking has already been paid. Return to the booking confirmation page.",
          });
          return;
        }
        if (existingCheckout.status === "complete") {
          response.status(409).json({
            error: "Payment for this booking is still processing. Please wait before retrying.",
          });
          return;
        }
      }
      booking.holdExpiresAt = new Date(Date.now() + 31 * 60 * 1000);
      await booking.save();
      const checkout = await stripe.checkout.sessions.create({
        mode: "payment",
        expires_at: Math.floor(booking.holdExpiresAt.getTime() / 1000),
        customer_email: booking.guestEmail,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: booking.totalMinor,
              product_data: {
                name: `${booking.roomName} · ${booking.nights} nights`,
                description: `${booking.quantity} room(s), ${booking.guests} guest(s)`,
              },
            },
          },
        ],
        metadata: { bookingId: booking._id.toString() },
        success_url: `${getFrontendUrl("/booking/result")}?status=success&booking=${booking._id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${getFrontendUrl("/booking")}?payment=cancelled&booking=${booking._id}`,
      });
      if (!checkout.url) {
        response.status(502).json({ error: "Stripe did not return a checkout page. Please try again." });
        return;
      }
      booking.paymentReference = checkout.id;
      await booking.save();
      response.json({ checkoutUrl: checkout.url });
      return;
    }
    const chapaSecret = process.env.CHAPA_SECRET_KEY;
    if (!chapaSecret) {
      response.status(503).json({ error: "ETB payments are not configured yet." });
      return;
    }
    booking.holdExpiresAt = new Date(Date.now() + 31 * 60 * 1000);
    await booking.save();
    const txRef = createChapaReference();
    const origin = process.env.PUBLIC_API_URL ?? `http://localhost:${port}`;
    const chapaResponse = await fetch("https://api.chapa.co/v1/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chapaSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: String(booking.totalMinor),
        currency: "ETB",
        email: booking.guestEmail,
        first_name: booking.guestName.split(/\s+/)[0],
        last_name: booking.guestName.split(/\s+/).slice(1).join(" ") || "Guest",
        phone_number: booking.guestPhone,
        tx_ref: txRef,
        callback_url: `${origin}/api/payments/chapa/webhook`,
        return_url: `${origin}/api/payments/chapa/return`,
        customization: {
          title: hotelName.slice(0, 16),
          description: `Booking ${booking._id.toString().slice(-8)}`,
        },
      }),
    });
    const chapaResult = (await chapaResponse.json()) as {
      status?: string;
      message?: string;
      data?: { checkout_url?: string };
    };
    if (!chapaResponse.ok || chapaResult.status !== "success" || !chapaResult.data?.checkout_url) {
      console.error("Chapa checkout initialization failed:", chapaResult.message ?? chapaResponse.status);
      response.status(502).json({ error: "Could not start ETB checkout. Please try again." });
      return;
    }
    booking.paymentReference = txRef;
    await booking.save();
    response.json({ checkoutUrl: chapaResult.data.checkout_url });
  }),
);

async function verifyChapa(txRef: string): Promise<{
  verified: boolean;
  amount: string;
  currency: string;
}> {
  const chapaSecret = process.env.CHAPA_SECRET_KEY;
  if (!chapaSecret) {
    throw new Error("Chapa is not configured.");
  }
  const result = await fetch(
    `https://api.chapa.co/v1/transaction/verify/${encodeURIComponent(txRef)}`,
    { headers: { Authorization: `Bearer ${chapaSecret}` } },
  );
  const body = (await result.json()) as {
    status?: string;
    data?: { status?: string; tx_ref?: string; amount?: string | number; currency?: string };
  };
  return {
    verified:
      result.ok &&
      body.status === "success" &&
      body.data?.status === "success" &&
      body.data.tx_ref === txRef,
    amount: String(body.data?.amount ?? ""),
    currency: body.data?.currency ?? "",
  };
}

async function settleChapaPayment(txRef: string): Promise<string | null> {
  const result = await verifyChapa(txRef);
  const booking = await Booking.findOne({
    paymentReference: txRef,
    paymentGateway: "chapa",
  });
  if (
    !result.verified ||
    !booking ||
    !Number.isFinite(Number(result.amount)) ||
    Number(result.amount) !== booking.totalMinor ||
    result.currency.toUpperCase() !== "ETB"
  ) {
    return null;
  }
  return confirmPaidBooking(booking._id.toString(), txRef);
}

async function settleStripePayment(
  checkout: Stripe.Checkout.Session,
): Promise<string | null> {
  if (!stripe) {
    return null;
  }
  const bookingId = checkout.metadata?.bookingId;
  if (!bookingId || !isValidObjectId(bookingId) || checkout.payment_status !== "paid") {
    return null;
  }
  const booking = await Booking.findById(bookingId);
  if (
    !booking ||
    booking.paymentGateway !== "stripe" ||
    booking.currency !== "USD" ||
    checkout.currency?.toLowerCase() !== "usd" ||
    checkout.amount_total !== booking.totalMinor
  ) {
    return null;
  }
  let duplicatePayment = false;
  if (booking.paymentReference && booking.paymentReference !== checkout.id) {
    const existingCheckout = await stripe.checkout.sessions.retrieve(
      booking.paymentReference,
    );
    if (existingCheckout.status === "open") {
      await stripe.checkout.sessions.expire(existingCheckout.id);
    } else if (existingCheckout.payment_status === "paid") {
      duplicatePayment = true;
    }
  }
  return confirmPaidBooking(bookingId, checkout.id, duplicatePayment);
}

app.get(
  "/api/payments/chapa/return",
  asyncRoute(async (request, response) => {
    const txRef = z.string().min(1).safeParse(request.query.tx_ref);
    if (!txRef.success) {
      response.redirect(getFrontendUrl("/booking/result?status=failed"));
      return;
    }
    const email = await settleChapaPayment(txRef.data);
    const booking = await Booking.findOne({ paymentReference: txRef.data }).select("_id");
    if (!email || !booking) {
      sendPaymentRedirect(response, "failed", booking?._id.toString() ?? "");
      return;
    }
    try {
      await sendBookingConfirmation(booking._id.toString());
    } catch (error) {
      console.error("Booking confirmation email failed:", error);
    }
    sendPaymentRedirect(response, "success", booking._id.toString());
  }),
);

app.post(
  "/api/payments/chapa/webhook",
  asyncRoute(async (request, response) => {
    const input = z.object({ tx_ref: z.string().min(1) }).safeParse(request.body);
    if (!input.success) {
      response.status(400).json({ error: "Missing Chapa transaction reference." });
      return;
    }
    const guestEmail = await settleChapaPayment(input.data.tx_ref);
    if (!guestEmail) {
      response.status(400).json({ error: "Chapa transaction is not verified as paid." });
      return;
    }
    const booking = await Booking.findOne({ paymentReference: input.data.tx_ref }).select("_id");
    if (booking) {
      try {
        await sendBookingConfirmation(booking._id.toString());
      } catch (error) {
        console.error("Booking confirmation email failed:", error);
      }
    }
    response.status(200).json({ received: true });
  }),
);

app.post(
  "/api/payments/stripe/webhook",
  asyncRoute(async (request, response) => {
    if (!stripe || !stripeWebhookSecret) {
      response.status(503).send("Stripe webhook is not configured.");
      return;
    }
    const signature = request.headers["stripe-signature"];
    if (typeof signature !== "string") {
      response.status(400).send("Missing Stripe signature.");
      return;
    }
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        request.body as Buffer,
        signature,
        stripeWebhookSecret,
      );
    } catch (error) {
      console.warn("Invalid Stripe webhook signature:", error);
      response.status(400).send("Invalid webhook signature.");
      return;
    }
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const checkout = event.data.object;
      const guestEmail = await settleStripePayment(checkout);
      if (guestEmail && checkout.metadata?.bookingId) {
        try {
          await sendBookingConfirmation(checkout.metadata.bookingId);
        } catch (error) {
          console.error("Booking confirmation email failed:", error);
        }
      }
    }
    response.json({ received: true });
  }),
);

app.post(
  "/api/payments/stripe/verify",
  asyncRoute(async (request, response) => {
    if (!stripe) {
      response.status(503).json({ error: "Stripe is not configured." });
      return;
    }
    const input = z
      .object({
        sessionId: z.string().min(1),
        bookingId: z.string().min(1),
      })
      .safeParse(request.body);
    if (!input.success || !isValidObjectId(input.data.bookingId)) {
      response.status(400).json({ error: "Invalid payment verification request." });
      return;
    }
    const checkout = await stripe.checkout.sessions.retrieve(input.data.sessionId);
    if (
      checkout.metadata?.bookingId !== input.data.bookingId ||
      checkout.payment_status !== "paid"
    ) {
      response.status(400).json({ error: "Stripe payment has not been confirmed." });
      return;
    }
    const guestEmail = await settleStripePayment(checkout);
    if (!guestEmail) {
      const booking = await Booking.findById(input.data.bookingId)
        .select("paymentStatus refundRequired")
        .lean();
      if (booking?.paymentStatus === "paid" && booking.refundRequired) {
        response.status(409).json({
          error:
            "Payment was received, but this booking needs hotel assistance. Contact the hotel before booking again.",
        });
        return;
      }
      response.status(400).json({ error: "Payment details do not match this booking." });
      return;
    }
    try {
      await sendBookingConfirmation(input.data.bookingId);
    } catch (error) {
      console.error("Booking confirmation email failed:", error);
    }
    response.json({ status: "confirmed" });
  }),
);

app.post(
  "/api/contact",
  contactLimiter,
  asyncRoute(async (request, response) => {
    const input = z
      .object({
        name: z.string().trim().min(2).max(100),
        email: z.string().email().max(254),
        message: z.string().trim().min(10).max(3000),
      })
      .safeParse(request.body);
    if (!input.success) {
      response.status(400).json({ error: "Enter your name, a valid email, and a message." });
      return;
    }
    if (!contactEmail) {
      response.status(503).json({
        error: "Hotel email delivery is not configured yet. Please try again later.",
      });
      return;
    }
    await sendEmail({
      to: contactEmail,
      replyTo: input.data.email,
      subject: `Website enquiry from ${input.data.name}`,
      text: `Name: ${input.data.name}\nEmail: ${input.data.email}\n\n${input.data.message}`,
    });
    response.status(202).json({ message: "Your message has been sent to the hotel." });
  }),
);

const frontendBuild = fileURLToPath(new URL("../../frontend/dist/", import.meta.url));
if (existsSync(frontendBuild)) {
  app.use(express.static(frontendBuild));
  app.use((request, response, next) => {
    if (request.path.startsWith("/api/")) {
      response.status(404).json({ error: "API endpoint not found." });
      return;
    }
    if (request.method === "GET") {
      response.sendFile(resolve(frontendBuild, "index.html"), (error) => {
        if (error) next(error);
      });
      return;
    }
    next();
  });
}

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  console.error("Request failed:", error);
  if (error instanceof SyntaxError && "status" in error && error.status === 400) {
    response.status(400).json({ error: "Request body must be valid JSON." });
    return;
  }
  if (error instanceof mongoose.Error.ValidationError) {
    response.status(400).json({ error: "Some submitted details are not valid." });
    return;
  }
  if (error instanceof mongoose.Error.CastError) {
    response.status(400).json({ error: "Invalid record identifier." });
    return;
  }
  response.status(500).json({ error: "The request could not be completed." });
};

app.use(errorHandler);

async function start(): Promise<void> {
  await connectDatabase();
  await ensureInitialAdmin();
  if (!emailDeliveryConfigured) {
    console.warn("Email delivery is disabled; configure SMTP_HOST/SMTP_FROM or RESEND_API_KEY/RESEND_FROM_EMAIL.");
  }
  const server = app.listen(port, () => {
    console.info(`${hotelName} API listening on port ${port}.`);
  });
  const cleanup = setInterval(() => {
    void Promise.all([
      expirePendingBookings().catch((error: unknown) => {
        console.error("Could not clean up expired booking holds:", error);
      }),
      retryBookingConfirmationEmails().catch((error: unknown) => {
        console.error("Could not retry booking confirmation emails:", error);
      }),
    ]);
  }, 60_000);
  cleanup.unref();

  const shutdown = (signal: NodeJS.Signals): void => {
    console.info(`${signal} received; shutting down the hotel API.`);
    clearInterval(cleanup);
    server.close((error) => {
      if (error) {
        console.error("HTTP server did not close cleanly:", error);
        process.exitCode = 1;
      }
      void disconnectDatabase().catch((disconnectError: unknown) => {
        console.error("MongoDB did not disconnect cleanly:", disconnectError);
        process.exitCode = 1;
      });
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

void start().catch((error: unknown) => {
  console.error("Hotel API failed to start:", error);
  process.exitCode = 1;
});
