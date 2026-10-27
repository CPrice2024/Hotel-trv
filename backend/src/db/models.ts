import mongoose, { Schema, model, type Model, type Types } from "mongoose";

interface RoomRecord {
  name: string;
  description: string;
  imageUrl: string;
  inventory: number;
  inventoryVersion: number;
  maxGuests: number;
  priceETB: number;
  priceUSDCents: number;
  testOnly: boolean;
  active: boolean;
}

export interface BookingRecord {
  parentBooking: Types.ObjectId | null;
  extensionVersion: number;
  paymentRequestEmailSent: boolean;
  room: Types.ObjectId;
  roomName: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  checkIn: Date;
  checkOut: Date;
  nights: number;
  quantity: number;
  guests: number;
  currency: "ETB" | "USD";
  totalMinor: number;
  usdToEtbRate: number | null;
  paymentGateway: "chapa" | "stripe";
  paymentStatus: "unpaid" | "paid" | "failed";
  confirmationEmailSent: boolean;
  confirmationEmailSendingAt: Date | null;
  refundRequired: boolean;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  holdExpiresAt: Date;
  paymentReference: string;
}

interface InventoryNightRecord {
  room: Types.ObjectId;
  date: string;
  remaining: number;
}

interface UserRecord {
  name: string;
  email: string;
  passwordHash: string;
  role: "admin" | "staff";
  active: boolean;
}

const roomSchema = new Schema<RoomRecord>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    imageUrl: { type: String, default: "" },
    inventory: { type: Number, required: true, min: 1 },
    inventoryVersion: { type: Number, default: 0 },
    maxGuests: { type: Number, required: true, min: 1 },
    priceETB: { type: Number, required: true, min: 0 },
    priceUSDCents: { type: Number, required: true, min: 1 },
    testOnly: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const bookingSchema = new Schema<BookingRecord>(
  {
    parentBooking: { type: Schema.Types.ObjectId, ref: "Booking", default: null },
    extensionVersion: { type: Number, default: 0 },
    paymentRequestEmailSent: { type: Boolean, default: false },
    room: { type: Schema.Types.ObjectId, ref: "Room", required: true },
    roomName: { type: String, required: true },
    guestName: { type: String, required: true, trim: true },
    guestEmail: { type: String, required: true, trim: true, lowercase: true },
    guestPhone: { type: String, required: true, trim: true },
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, required: true },
    nights: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    guests: { type: Number, required: true, min: 1 },
    currency: { type: String, enum: ["ETB", "USD"], required: true },
    totalMinor: { type: Number, required: true, min: 1 },
    usdToEtbRate: { type: Number, default: null, min: 0.01 },
    paymentGateway: { type: String, enum: ["chapa", "stripe"], required: true },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid", "failed"],
      default: "unpaid",
    },
    confirmationEmailSent: { type: Boolean, default: false },
    confirmationEmailSendingAt: { type: Date, default: null },
    refundRequired: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "completed"],
      default: "pending",
    },
    holdExpiresAt: { type: Date, required: true },
    paymentReference: { type: String, default: "" },
  },
  { timestamps: true },
);

bookingSchema.index({ room: 1, checkIn: 1, checkOut: 1, status: 1 });
bookingSchema.index({ parentBooking: 1, status: 1, checkOut: -1 });
bookingSchema.index({ holdExpiresAt: 1, status: 1 });

const inventoryNightSchema = new Schema<InventoryNightRecord>(
  {
    room: { type: Schema.Types.ObjectId, ref: "Room", required: true },
    date: { type: String, required: true },
    remaining: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

inventoryNightSchema.index({ room: 1, date: 1 }, { unique: true });

const userSchema = new Schema<UserRecord>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin", "staff"], required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Room: Model<RoomRecord> =
  (mongoose.models.Room as Model<RoomRecord> | undefined) ??
  model<RoomRecord>("Room", roomSchema);
export const Booking: Model<BookingRecord> =
  (mongoose.models.Booking as Model<BookingRecord> | undefined) ??
  model<BookingRecord>("Booking", bookingSchema);
export const InventoryNight =
  (mongoose.models.InventoryNight as Model<InventoryNightRecord> | undefined) ??
  model<InventoryNightRecord>("InventoryNight", inventoryNightSchema);
export const User: Model<UserRecord> =
  (mongoose.models.User as Model<UserRecord> | undefined) ??
  model<UserRecord>("User", userSchema);
