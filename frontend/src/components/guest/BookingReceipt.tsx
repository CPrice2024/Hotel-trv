import { toPng } from "html-to-image";
import { useRef, useState } from "react";
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
  const receiptRef = useRef<HTMLElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const downloadReceipt = async () => {
    if (!receiptRef.current) return;
    setIsSaving(true);
    setErrorMessage("");
    try {
      const dataUrl = await toPng(receiptRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#fffefa",
      });
      const link = document.createElement("a");
      link.download = `ayele-hotel-receipt-${booking.id}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error("Could not create booking receipt image:", error);
      setErrorMessage("We could not create the receipt image. Please try again or print this page.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="receipt-download-area">
      <article className="booking-receipt" ref={receiptRef}>
        <header className="receipt-header">
          <span className="brand-mark" aria-hidden="true">A</span>
          <div>
            <span className="eyebrow">PAYMENT RECEIPT</span>
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
          onClick={() => void downloadReceipt()}
          disabled={isSaving}
        >
          <Download aria-hidden="true" />
          {isSaving ? "Preparing receipt…" : "Download receipt screenshot"}
        </button>
      </div>
      {errorMessage && <p className="form-message" role="alert">{errorMessage}</p>}
    </div>
  );
}
