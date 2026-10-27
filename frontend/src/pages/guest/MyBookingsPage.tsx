import { formatBookingReference } from "../../lib/bookingReference";
import { formatStayDate, translateText, useLanguage } from "../../i18n/language";
import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { Link } from "react-router-dom";
import { api, getErrorMessage, type GuestBooking } from "../../api";
import { BookingReceipt } from "../../components/guest/BookingReceipt";
import {
  getActiveBookingEmail,
  getRememberedBookingIds,
  rememberActiveBooking,
} from "../../lib/guestBookings";
import { SiteHeader } from "../SiteHeader";

export function MyBookingsPage() {
  useLanguage();
  const [bookingId, setBookingId] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [booking, setBooking] = useState<GuestBooking | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [savedBookingIds] = useState(getRememberedBookingIds);

  const findBooking = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBooking(null);
    setPaymentError("");
    setErrorMessage("");
    setIsSearching(true);
    const normalizedEmail = guestEmail.trim().toLowerCase();
    const normalizedId = bookingId.trim();

    try {
      const { data } = await api.post<{ booking: GuestBooking }>(
        "/guest/bookings/lookup",
        { bookingId: normalizedId, guestEmail: normalizedEmail },
      );
      setBooking(data.booking);
      rememberActiveBooking(data.booking.id, normalizedEmail);
    } catch (error) {
      setErrorMessage(
        getErrorMessage(
          error,
          "We could not find that booking. Check the reference and email address.",
        ),
      );
    } finally {
      setIsSearching(false);
    }
  };

  const selectSavedBooking = (id: string) => {
    setBookingId(id);
    const savedEmail = getActiveBookingEmail(id);
    if (savedEmail) setGuestEmail(savedEmail);
  };

  const payNow = async () => {
    if (!booking || isPaying) return;
    setIsPaying(true);
    setPaymentError("");
    try {
      rememberActiveBooking(booking.id, booking.guestEmail);
      const { data } = await api.post<{ checkoutUrl: string }>("/payments/checkout", {
        bookingId: booking.id,
        guestEmail: booking.guestEmail,
      });
      window.location.assign(data.checkoutUrl);
    } catch (error) {
      setPaymentError(getErrorMessage(error, "Could not start payment. Please try again."));
      setIsPaying(false);
    }
  };

  return (
    <>
      <SiteHeader />
      <main className="app-page my-bookings-page">
        <div className="section-wrap">
          <Link className="back-link" to="/">{translateText("Back to the hotel")}</Link>
          <header className="page-heading">
            <p className="eyebrow">{translateText("Your stay, all in one place")}</p>
            <h1>{translateText("My ")}<em>{translateText("bookings.")}</em></h1>
            <p>{translateText("Enter your booking reference and the email address used at checkout to view your booking and payment status.")}</p>
          </header>

          <form
            className="booking-lookup-form"
            onSubmit={(event) => void findBooking(event)}
          >
            <label>{translateText("Booking reference")}<input
                type="text"
                autoComplete="off"
                value={bookingId}
                onChange={(event) => setBookingId(event.target.value)}
                placeholder={translateText("Enter your booking reference")}
                required
              />
            </label>
            <label>{translateText("Booking email")}<input
                type="email"
                autoComplete="email"
                value={guestEmail}
                onChange={(event) => setGuestEmail(event.target.value)}
                required
              />
            </label>
            <button className="button button-dark" type="submit" disabled={isSearching}>
              <Search aria-hidden="true" />
              {translateText(isSearching ? "Searching…" : "Find booking")}
            </button>
          </form>
          {translateText(errorMessage && (
            <p className="form-message" role="alert">{translateText(errorMessage)}</p>
          ))}

          {translateText(savedBookingIds.length > 0 && (
            <section className="saved-bookings">
              <h2>{translateText("Recent booking references on this device")}</h2>
              <p>{translateText("Choose a reference, then enter the booking email to view its details.")}</p>
              <div>
                {translateText(savedBookingIds.map((id) => (
                  <button type="button" key={id} onClick={() => selectSavedBooking(id)}>
                    {formatBookingReference(id)}
                  </button>
                )))}
              </div>
            </section>
          ))}

          {translateText(booking && (
            <section className="my-booking-result" aria-live="polite">
              <div className={`booking-status-pill booking-status-${booking.paymentStatus}`}>{translateText("Payment ")}{translateText(booking.paymentStatus)}
              </div>
              <h2>{translateText(booking.roomName)}</h2>
              <p className="my-booking-reference">{translateText("Booking reference: ")}{formatBookingReference(booking.id)}</p>
              {booking.extensions && booking.extensions.length > 0 && <section className="guest-extension-summary">
                <h3>Stay extensions</h3>
                {booking.extensions.map(extension => <p key={extension.id}><strong>{formatBookingReference(extension.id)}</strong>: {formatStayDate(extension.checkIn)} to {formatStayDate(extension.checkOut)} — {extension.status === "confirmed" && extension.paymentStatus === "paid" ? "Confirmed and paid" : extension.status === "pending" ? "Awaiting extension payment; use the payment link emailed by the hotel" : extension.status}</p>)}
              </section>}
              <div className="my-booking-details">
                <p><span>{translateText("Guest")}</span><strong>{booking.guestName}</strong></p>
                <p><span>{translateText("Stay dates")}</span><strong>{formatStayDate(booking.checkIn)}{translateText(" – ")}{formatStayDate(booking.checkOut)}</strong></p>
                <p>
                  <span>{translateText("Length of stay")}</span>
                  <strong>{translateText(booking.nights)} {translateText(booking.nights === 1 ? "night" : "nights")}</strong>
                </p>
                <p>
                  <span>{translateText("Rooms and guests")}</span>
                  <strong>
                    {translateText(booking.quantity)} {translateText(booking.quantity === 1 ? "room" : "rooms")}{translateText(" ·")}{translateText(" ")}
                    {translateText(booking.guests)} {translateText(booking.guests === 1 ? "guest" : "guests")}
                  </strong>
                </p>
                <p><span>{translateText("Booking status")}</span><strong>{translateText(booking.status)}</strong></p>
              </div>
              {translateText(booking.paymentStatus === "paid" ? (
                <BookingReceipt booking={booking} />
              ) : (
                <p className="booking-payment-notice" role="status">{translateText("Payment is ")}{translateText(booking.paymentStatus)}{translateText(". A receipt will be available here after the payment is verified.")}</p>
              ))}
              {translateText(booking.paymentStatus !== "paid" && booking.status === "pending" && (
                <div className="receipt-actions">
                  <button
                    className="button button-dark"
                    type="button"
                    onClick={() => void payNow()}
                    disabled={isPaying || isSearching}
                  >
                    {translateText(isPaying ? "Opening checkout…" : "Pay now")}
                  </button>
                </div>
              ))}
              {translateText(paymentError && <p className="form-message" role="alert">{translateText(paymentError)}</p>)}
            </section>
          ))}
        </div>
      </main>
    </>
  );
}
