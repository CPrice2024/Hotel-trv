import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

export function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<{ error?: string }>(error)) {
    return error.response?.data?.error ?? fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

export interface HotelConfig {
  name: string;
  email: string;
  phone: string;
  address: string;
  location: { latitude: number; longitude: number } | null;
  directionsUrl: string;
  paymentMethods: { chapa: boolean; stripe: boolean };
  authenticationMethods: { google: boolean; googleClientId?: string };
}

export interface Room {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  inventory: number;
  maxGuests: number;
  priceETB: number;
  priceUSD: number;
  testOnly?: boolean;
  active: boolean;
}

export interface StaffUser {
  name: string;
  email: string;
  role: "admin" | "staff";
}

export interface BookingRecord {
  id: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  quantity: number;
  guests: number;
  currency: "ETB" | "USD";
  totalMinor: number;
  paymentStatus: "unpaid" | "paid" | "failed";
  refundRequired: boolean;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  createdAt: string;
  nights?: number;
  paymentGateway?: "chapa" | "stripe";
  paymentReference?: string;
  holdExpiresAt?: string;
  confirmationEmailSent?: boolean;
}

export interface GuestBooking {
  id: string;
  roomName: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  quantity: number;
  guests: number;
  currency: "ETB" | "USD";
  total: number;
  usdToEtbRate: number | null;
  paymentGateway: "chapa" | "stripe";
  paymentStatus: "unpaid" | "paid" | "failed";
  paymentReference: string;
  status: "pending" | "confirmed" | "cancelled" | "completed";
}
