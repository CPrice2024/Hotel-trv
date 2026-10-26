import { formatStayDate, getLocale, translateText, useLanguage } from "../../i18n/language";


import { Download } from "lucide-react";
import type { GuestBooking } from "../../api";

interface BookingReceiptProps {
  booking: GuestBooking;
  hotelName?: string;
}

function formatMoney(amount: number, currency: GuestBooking["currency"]) {
  return new Intl.NumberFormat(getLocale(), {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "USD" ? 2 : 0,
  }).format(amount);
}

function formatExchangeRate(rate: number) {
  return new Intl.NumberFormat(getLocale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(rate);
}

export function BookingReceipt({
  booking,
  hotelName = "Ayele Degu International Hotel",
}: BookingReceiptProps) {
  useLanguage();
  return (
    <div className="receipt-download-area">
      <article className="booking-receipt">
        <header className="receipt-header">
          <span className="brand-mark" aria-hidden="true">{translateText("A")}</span>
          <div>
            <span className="eyebrow">{translateText("BOOKING SLIP")}</span>
            <h2>{translateText(hotelName)}</h2>
          </div>
          <span className="receipt-paid">{translateText("PAID")}</span>
        </header>

        <div className="receipt-reference">
          <span>{translateText("Booking reference")}</span>
          <strong>{booking.id}</strong>
        </div>

        <section className="receipt-details" aria-label={translateText("Booking receipt details")}>
          <div>
            <h3>{translateText("Guest")}</h3>
            <p>{booking.guestName}</p>
            <p>{booking.guestEmail}</p>
            <p>{booking.guestPhone}</p>
          </div>
          <div>
            <h3>{translateText("Stay")}</h3>
            <p>{translateText(booking.roomName)}</p>
            <p>{translateText(booking.quantity)} {translateText(booking.quantity === 1 ? "room" : "rooms")}{translateText(" · ")}{translateText(booking.guests)} {translateText(booking.guests === 1 ? "guest" : "guests")}</p>
            <p>{formatStayDate(booking.checkIn)}{translateText(" – ")}{formatStayDate(booking.checkOut)}</p>
            <p>{translateText(booking.nights)} {translateText(booking.nights === 1 ? "night" : "nights")}</p>
          </div>
        </section>

        <section className="receipt-payment">
          <div><span>{translateText("Payment method")}</span><strong>{translateText(booking.paymentGateway === "chapa" ? "Chapa" : "Stripe")}</strong></div>
          {translateText(booking.currency === "ETB" && booking.usdToEtbRate && (
            <div>
              <span>{translateText("USD/ETB rate used")}</span>
              <strong>{translateText("1 USD = ETB ")}{translateText(formatExchangeRate(booking.usdToEtbRate))}</strong>
            </div>
          ))}
          <div><span>{translateText("Payment reference")}</span><strong>{translateText(booking.paymentReference || "Verified")}</strong></div>
          <div className="receipt-total"><span>{translateText("Total paid")}</span><strong>{translateText(formatMoney(booking.total, booking.currency))}</strong></div>
        </section>

        <footer className="receipt-footer">
          <span>{translateText("Booking status: ")}{translateText(booking.status)}</span>
          <span>{translateText("Thank you for choosing ")}{translateText(hotelName)}{translateText(".")}</span>
        </footer>
      </article>

      <div className="receipt-actions">
        <button
          className="button button-dark"
          type="button"
          onClick={() => window.print()}
        >
          <Download aria-hidden="true" />{translateText("Download booking slip")}</button>
      </div>
    </div>
  );
}
