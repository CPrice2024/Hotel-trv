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
  const [bookingId, setBookingId] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [booking, setBooking] = useState<GuestBooking | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [savedBookingIds] = useState(getRememberedBookingIds);

  const findBooking = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBooking(null);
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

  return (
    <>
      <SiteHeader />
      <main className="app-page my-bookings-page">
        <div className="section-wrap">
          <Link className="back-link" to="/">
            Back to the hotel
          </Link>
          <header className="page-heading">
            <p className="eyebrow">Your stay, all in one place</p>
            <h1>My <em>bookings.</em></h1>
            <p>
              Enter your booking reference and the email address used at checkout
              to view your booking and payment status.
            </p>
          </header>

          <form
            className="booking-lookup-form"
            onSubmit={(event) => void findBooking(event)}
          >
            <label>
              Booking reference
              <input
                type="text"
                autoComplete="off"
                value={bookingId}
                onChange={(event) => setBookingId(event.target.value)}
                placeholder="Enter your booking reference"
                required
              />
            </label>
            <label>
              Booking email
              <input
                type="email"
                autoComplete="email"
                value={guestEmail}
                onChange={(event) => setGuestEmail(event.target.value)}
                required
              />
            </label>
            <button className="button button-dark" type="submit" disabled={isSearching}>
              <Search aria-hidden="true" />
              {isSearching ? "Searching…" : "Find booking"}
            </button>
          </form>
          {errorMessage && (
            <p className="form-message" role="alert">{errorMessage}</p>
          )}

          {savedBookingIds.length > 0 && (
            <section className="saved-bookings">
              <h2>Recent booking references on this device</h2>
              <p>Choose a reference, then enter the booking email to view its details.</p>
              <div>
                {savedBookingIds.map((id) => (
                  <button type="button" key={id} onClick={() => selectSavedBooking(id)}>
                    {id}
                  </button>
                ))}
              </div>
            </section>
          )}

          {booking && (
            <section className="my-booking-result" aria-live="polite">
              <div className={`booking-status-pill booking-status-${booking.paymentStatus}`}>
                Payment {booking.paymentStatus}
              </div>
              <h2>{booking.roomName}</h2>
              <p className="my-booking-reference">Booking reference: {booking.id}</p>
              <div className="my-booking-details">
                <p><span>Guest</span><strong>{booking.guestName}</strong></p>
                <p><span>Stay dates</span><strong>{booking.checkIn} – {booking.checkOut}</strong></p>
                <p>
                  <span>Length of stay</span>
                  <strong>{booking.nights} {booking.nights === 1 ? "night" : "nights"}</strong>
                </p>
                <p>
                  <span>Rooms and guests</span>
                  <strong>
                    {booking.quantity} {booking.quantity === 1 ? "room" : "rooms"} ·{" "}
                    {booking.guests} {booking.guests === 1 ? "guest" : "guests"}
                  </strong>
                </p>
                <p><span>Booking status</span><strong>{booking.status}</strong></p>
              </div>
              {booking.paymentStatus === "paid" ? (
                <BookingReceipt booking={booking} />
              ) : (
                <p className="booking-payment-notice" role="status">
                  Payment is {booking.paymentStatus}. A receipt will be available
                  here after the payment is verified.
                </p>
              )}
            </section>
          )}
        </div>
      </main>
    </>
  );
}