import { formatBookingReference } from "../lib/bookingReference";
import { translateText, useLanguage } from "../i18n/language";
import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { api, getErrorMessage, type GuestBooking, type HotelConfig } from "../api";
import { BookingReceipt } from "../components/guest/BookingReceipt";
import { PaymentEmailNotice } from "../components/guest/PaymentEmailNotice";
import { clearActiveBooking, getActiveBookingEmail } from "../lib/guestBookings";
import { SiteHeader } from "./SiteHeader";

export function BookingResultPage() {
  useLanguage();
  const [searchParams] = useSearchParams();
  const status = searchParams.get("status");
  const bookingId = searchParams.get("booking") ?? "";
  const sessionId = searchParams.get("session_id");
  const [message, setMessage] = useState("We’re confirming your payment securely.");
  const [confirmed, setConfirmed] = useState(false);
  const [failed, setFailed] = useState(status === "failed");
  const [guestEmail, setGuestEmail] = useState(() => getActiveBookingEmail(bookingId));
  const [emailInput, setEmailInput] = useState(guestEmail);
  const [receipt, setReceipt] = useState<GuestBooking | null>(null);
  const [receiptError, setReceiptError] = useState("");
  const [isLoadingReceipt, setIsLoadingReceipt] = useState(false);
  const [receiptLookupAttempt, setReceiptLookupAttempt] = useState(0);
  const [hotelName, setHotelName] = useState("Ayele Degu International Hotel");

  useEffect(() => {
    let active = true;
    api
      .get<HotelConfig>("/public/config")
      .then(({ data }) => {
        if (active && data.name) setHotelName(data.name);
      })
      .catch((error: unknown) => {
        console.error("Could not load hotel name for booking receipt:", error);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (status !== "success" || !bookingId) return;
    let active = true;

    const confirmPayment = async () => {
      try {
        if (sessionId) {
          await api.post("/payments/stripe/verify", { bookingId, sessionId });
        }
        if (active) {
          setConfirmed(true);
          setMessage("Payment confirmed. Your receipt is ready below.");
        }
      } catch (error) {
        if (active) {
          setFailed(true);
          setMessage(
            getErrorMessage(
              error,
              "We could not verify this payment yet. Contact the hotel before booking again.",
            ),
          );
        }
      }
    };

    void confirmPayment();
    return () => {
      active = false;
    };
  }, [bookingId, sessionId, status]);

  useEffect(() => {
    if (!confirmed || !guestEmail || !bookingId || receipt) return;
    let active = true;
    setIsLoadingReceipt(true);
    setReceiptError("");
    api
      .post<{ booking: GuestBooking }>("/guest/bookings/lookup", {
        bookingId,
        guestEmail,
      })
      .then(({ data }) => {
        if (!active) return;
        if (data.booking.paymentStatus !== "paid") {
          setReceiptError("Payment is still processing. Refresh this page in a moment.");
          return;
        }
        setReceipt(data.booking);
        setMessage("Payment confirmed. Your booking receipt is ready.");
        clearActiveBooking(bookingId);
      })
      .catch((error: unknown) => {
        if (active) {
          setReceiptError(
            getErrorMessage(
              error,
              "We could not load your receipt. Enter the booking email below or use My bookings.",
            ),
          );
        }
      })
      .finally(() => {
        if (active) setIsLoadingReceipt(false);
      });
    return () => {
      active = false;
    };
  }, [bookingId, confirmed, guestEmail, receipt, receiptLookupAttempt]);

  const submitReceiptEmail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setReceipt(null);
    setGuestEmail(emailInput.trim().toLowerCase());
    setReceiptLookupAttempt((attempt) => attempt + 1);
  };

  return (
    <>
      <SiteHeader />
      <main className="app-page result-page">
        <section className="result-card">
          {translateText(failed ? (
            <CircleAlert className="result-icon error-icon" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="result-icon" aria-hidden="true" />
          ))}
          <p className="eyebrow">{translateText("Booking update")}</p>
          <h1>{translateText(failed ? "Payment needs attention." : confirmed ? "You’re all set." : "One moment…")}</h1>
          <p role="status">{translateText(message)}</p>
          {confirmed && !failed && <PaymentEmailNotice email={receipt?.guestEmail} />}
          {translateText(bookingId && <p className="contact-note">{translateText("Booking reference: ")}{formatBookingReference(bookingId)}</p>)}
          {translateText(confirmed && !receipt && (
            <form className="receipt-email-form" onSubmit={submitReceiptEmail}>
              <label htmlFor="receipt-email">{translateText("Enter the email used for this booking to load your receipt")}</label>
              <input
                id="receipt-email"
                type="email"
                autoComplete="email"
                value={emailInput}
                onChange={(event) => setEmailInput(event.target.value)}
                required
              />
              <button className="button button-dark" type="submit" disabled={isLoadingReceipt}>
                {translateText(isLoadingReceipt ? "Loading receipt…" : "Show my receipt")}
              </button>
            </form>
          ))}
          {translateText(receiptError && <p className="form-message" role="alert">{translateText(receiptError)}</p>)}
          {translateText(receipt && <BookingReceipt booking={receipt} hotelName={hotelName} />)}
          <div className="result-actions">
            <Link className="button button-dark" to="/my-bookings">{translateText("My bookings")}</Link>
            <Link className="button button-outline" to="/">{translateText("Back to the hotel")}</Link>
            {translateText(failed && <Link className="button button-outline" to="/booking">{translateText("Try another payment")}</Link>)}
          </div>
        </section>
      </main>
    </>
  );
}
