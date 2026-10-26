

import { Download } from "lucide-react";
import type { GuestBooking } from "../../api";

interface BookingReceiptProps {
  booking: GuestBooking;
  hotelName?: string;
}

function formatMoney(amount: number, currency: GuestBooking["currency"]) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "USD" ? 2 : 0,
  }).format(amount);
}

function formatExchangeRate(rate: number) {
  return new Intl.NumberFormat("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(rate);
}

export function BookingReceipt({
  booking,
  hotelName = "Ayele Degu International Hotel",
}: BookingReceiptProps) {
  return (
    <div className="receipt-download-area">
      <article className="booking-receipt">
        <header className="receipt-header">
          <span className="brand-mark" aria-hidden="true">A</span>
          <div>
            <span className="eyebrow">BOOKING SLIP</span>
            <h2>{hotelName}</h2>
          </div>
          <span className="receipt-paid">PAID</span>
        </header>

        <div className="receipt-reference">
          <span>Booking reference</span>
          <strong>{booking.id}</strong>
        </div>

        <section className="receipt-details" aria-label="Booking receipt details">
          <div>
            <h3>Guest</h3>
            <p>{booking.guestName}</p>
            <p>{booking.guestEmail}</p>
            <p>{booking.guestPhone}</p>
          </div>
          <div>
            <h3>Stay</h3>
            <p>{booking.roomName}</p>
            <p>{booking.quantity} {booking.quantity === 1 ? "room" : "rooms"} · {booking.guests} {booking.guests === 1 ? "guest" : "guests"}</p>
            <p>{booking.checkIn} – {booking.checkOut}</p>
            <p>{booking.nights} {booking.nights === 1 ? "night" : "nights"}</p>
          </div>
        </section>

        <section className="receipt-payment">
          <div><span>Payment method</span><strong>{booking.paymentGateway === "chapa" ? "Chapa" : "Stripe"}</strong></div>
          {booking.currency === "ETB" && booking.usdToEtbRate && (
            <div>
              <span>USD/ETB rate used</span>
              <strong>1 USD = ETB {formatExchangeRate(booking.usdToEtbRate)}</strong>
            </div>
          )}
          <div><span>Payment reference</span><strong>{booking.paymentReference || "Verified"}</strong></div>
          <div className="receipt-total"><span>Total paid</span><strong>{formatMoney(booking.total, booking.currency)}</strong></div>
        </section>

        <footer className="receipt-footer">
          <span>Booking status: {booking.status}</span>
          <span>Thank you for choosing {hotelName}.</span>
        </footer>
      </article>

      <div className="receipt-actions">
        <button
          className="button button-dark"
          type="button"
          onClick={() => window.print()}
        >
          <Download aria-hidden="true" />
          Download booking slip
        </button>
      </div>
    </div>
  );
}
