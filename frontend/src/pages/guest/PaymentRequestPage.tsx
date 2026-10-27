import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, getErrorMessage } from "../../api";
import { formatBookingReference } from "../../lib/bookingReference";
import { rememberActiveBooking } from "../../lib/guestBookings";
import { SiteHeader } from "../SiteHeader";
import { PaymentEmailNotice } from "../../components/guest/PaymentEmailNotice";

interface PaymentRequest { id: string; parentBooking: string; roomName: string; guestName: string; guestEmail: string; checkIn: string; checkOut: string; nights: number; quantity: number; currency: "ETB" | "USD"; totalMinor: number; status: string; paymentStatus: string; holdExpiresAt: string }
const date = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function PaymentRequestPage() {
  const token = useLocation().hash.slice(1);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const request = useQuery({ queryKey: ["extension-payment-request", token], queryFn: async () => (await api.post<{ booking: PaymentRequest }>("/guest/payment-request", { token })).data.booking, enabled: Boolean(token), retry: false, refetchInterval: query => query.state.data?.status === "pending" ? 15000 : false, gcTime: 0 });
  const b = request.data;
  const expired = b ? new Date(b.holdExpiresAt) <= new Date() : false;
  const canPay = b?.status === "pending" && b.paymentStatus !== "paid" && !expired;
  const pay = async () => {
    if (!b || !canPay || paying) return;
    setPaying(true); setError("");
    try {
      rememberActiveBooking(b.id, b.guestEmail);
      const { data } = await api.post<{ checkoutUrl: string }>("/payments/checkout", { bookingId: b.id, guestEmail: b.guestEmail });
      window.location.assign(data.checkoutUrl);
    } catch (err) { setError(getErrorMessage(err, "Could not start payment. Please try again.")); setPaying(false); void request.refetch(); }
  };
  return <><SiteHeader /><main className="app-page result-page"><section className="result-card">
    <p className="eyebrow">Stay extension</p><h1>Your additional nights</h1>
    {b?.paymentStatus === "paid" && b.status === "confirmed" && <PaymentEmailNotice email={b.guestEmail} />}
    {!token && <p role="alert">Open the payment link from your hotel email. Contact the hotel if you need a new request.</p>}
    {request.isFetching && !b && token && <p role="status">Loading your payment request...</p>}
    {request.error && <p className="form-message" role="alert">{getErrorMessage(request.error, "Could not load this payment request.")}</p>}
    {b && <>
      <p>Hello {b.guestName}. The hotel has prepared this extension for booking <strong>{formatBookingReference(b.parentBooking)}</strong>.</p>
      <dl className="extension-payment-details">
        <div><dt>Room type</dt><dd>{b.roomName}</dd></div>
        <div><dt>Extra stay</dt><dd>{date(b.checkIn)} to {date(b.checkOut)}</dd></div>
        <div><dt>Extra nights / rooms</dt><dd>{b.nights} night(s), {b.quantity} room(s)</dd></div>
        <div><dt>Additional payment</dt><dd>{new Intl.NumberFormat("en", { style: "currency", currency: b.currency }).format(b.totalMinor / (b.currency === "USD" ? 100 : 1))}</dd></div>
        <div><dt>Payment request</dt><dd>{formatBookingReference(b.id)}</dd></div>
      </dl>
      {b.paymentStatus === "paid" && b.status === "confirmed" ? <p role="status">Payment received. Your extension is confirmed through {date(b.checkOut)}. Your confirmation and receipt will be emailed to {b.guestEmail}.</p> : b.paymentStatus === "paid" ? <p role="status">This payment needs review. Please contact the hotel.</p> : canPay ? <>
        <p>Your existing paid stay is unchanged. These extra nights are confirmed after payment. Your payment hold expires on {new Date(b.holdExpiresAt).toLocaleString()}.</p>
        <p>Pay securely with {b.currency === "ETB" ? "Chapa in Ethiopian Birr" : "Stripe in US dollars"}. Starting checkout gives you 31 minutes to complete payment.</p>
        <button type="button" className="button button-dark" disabled={paying} onClick={() => void pay()}>{paying ? "Opening secure checkout..." : "Pay now"}</button>
      </> : <p role="status">This request has expired or was cancelled. Please contact the hotel for a new extension request. Your original booking remains unchanged.</p>}
    </>}
    {error && <p className="form-message" role="alert">{error}</p>}
    <div className="result-actions"><Link to="/my-bookings" className="button button-outline">My bookings</Link><Link to="/" className="button button-outline">Back to the hotel</Link></div>
  </section></main></>;
}
