import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, getErrorMessage, type BookingRecord } from "../../api";
import { useStaffStore } from "../../store";
import { formatBookingReference } from "../../lib/bookingReference";

interface Quote { checkIn: string; checkOut: string; nights: number; quantity: number; currency: string; totalMinor: number }
const date = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const money = (value: number, currency: string) => new Intl.NumberFormat("en", { style: "currency", currency }).format(value / (currency === "USD" ? 100 : 1));

export function StayExtensionPanel({ booking }: { booking: BookingRecord }) {
  const admin = useStaffStore(state => state.user?.role === "admin");
  const client = useQueryClient();
  const [checkOut, setCheckOut] = useState("");
  const [notice, setNotice] = useState("");
  const refresh = () => { for (const key of ["staff-booking", "staff-bookings", "staff-dashboard", "staff-reports", "rooms"]) void client.invalidateQueries({ queryKey: [key] }); };
  const preview = useMutation({ mutationFn: async () => (await api.post<{ quote: Quote }>(`/staff/bookings/${booking.id}/extensions/quote`, { checkOut })).data.quote });
  const send = useMutation({ mutationFn: async () => (await api.post<{ emailSent: boolean }>(`/staff/bookings/${booking.id}/extensions`, { checkOut, quotedTotalMinor: preview.data?.totalMinor })).data, onSuccess: data => {
    setNotice(data.emailSent ? `Extension payment request sent to ${booking.guestEmail}. The extra nights are awaiting payment.` : "The extension is held, but its email could not be delivered. Use Resend payment email below.");
    preview.reset(); setCheckOut(""); refresh();
  } });
  const resend = useMutation({ mutationFn: (id: string) => api.post(`/staff/bookings/${id}/payment-request-email`), onSuccess: () => { setNotice(`Payment request emailed to ${booking.guestEmail}.`); refresh(); } });
  const extensions = booking.extensions ?? [];
  const pending = extensions.some(e => e.status === "pending");
  const currentCheckout = extensions.filter(e => e.status === "confirmed" && e.paymentStatus === "paid").reduce((end, e) => e.checkOut > end ? e.checkOut : end, booking.checkOut);
  const minDate = new Date(new Date(currentCheckout).getTime() + 86400000).toISOString().slice(0, 10);
  const maxDate = new Date(new Date(booking.checkIn).getTime() + 60 * 86400000).toISOString().slice(0, 10);
  const canExtend = admin && !booking.parentBooking && booking.status === "confirmed" && booking.paymentStatus === "paid" && !booking.refundRequired;
  const onPreview = (event: FormEvent) => { event.preventDefault(); setNotice(""); send.reset(); preview.mutate(); };
  return <section className="management-panel stay-extension-panel">
    <div className="panel-heading"><h2>Stay extensions</h2></div>
    {booking.parentBooking && <p>This reservation covers extra nights for <Link to={`/admin/reservations/${booking.parentBooking}`}>{formatBookingReference(booking.parentBooking)}</Link>.</p>}
    {notice && <p className="management-notice" role="status">{notice}</p>}
    {extensions.length > 0 && <div className="table-wrap"><table><thead><tr><th>Extension</th><th>Extra stay</th><th>Additional charge</th><th>Status</th><th>Payment request</th></tr></thead><tbody>{extensions.map(e => <tr key={e.id}>
      <td><Link to={`/admin/reservations/${e.id}`}>{formatBookingReference(e.id)}</Link></td>
      <td>{date(e.checkIn)} to {date(e.checkOut)}</td><td>{money(e.totalMinor, e.currency)}</td>
      <td>{e.status === "confirmed" && e.paymentStatus === "paid" ? "Confirmed and paid" : e.status === "pending" ? "Awaiting payment" : e.status}</td>
      <td>{admin && e.status === "pending" && e.holdExpiresAt && new Date(e.holdExpiresAt) > new Date() ? <button type="button" className="management-button" disabled={resend.isPending} onClick={() => resend.mutate(e.id)}>Resend payment email</button> : e.status === "pending" ? "Hold expired; awaiting release" : e.paymentStatus}</td>
    </tr>)}</tbody></table></div>}
    {canExtend && <form className="management-form extension-request-form" onSubmit={onPreview}>
      <p>Confirmed checkout: <strong>{date(currentCheckout)}</strong>. Extend the same room type and room quantity at the current nightly rate. Only the extra nights are charged.</p>
      {pending ? <p className="management-notice">An extension request is awaiting payment. Open it to cancel, or resend its payment email above.</p> : <>
        <label>New checkout date<input required type="date" min={minDate} max={maxDate} value={checkOut} disabled={send.isPending || preview.isPending} onChange={e => { setCheckOut(e.target.value); preview.reset(); send.reset(); }} /></label>
        <div><button className="management-button" disabled={preview.isPending || send.isPending}>{preview.isPending ? "Checking availability..." : "Preview extension and price"}</button></div>
        {preview.data && <div className="management-notice"><p>{preview.data.nights} extra night(s), {preview.data.quantity} room(s): <strong>{money(preview.data.totalMinor, preview.data.currency)}</strong></p><p>Extra stay: {date(preview.data.checkIn)} to {date(preview.data.checkOut)}. Payment request will be emailed to <strong>{booking.guestEmail}</strong>. The extra nights are held for up to 24 hours; starting checkout creates a 31-minute payment window.</p><button type="button" className="management-button primary" disabled={send.isPending} onClick={() => send.mutate()}>{send.isPending ? "Creating request..." : "Hold extra nights and email payment request"}</button></div>}
      </>}
    </form>}
    {[preview.error, send.error, resend.error].filter(Boolean).map((error, index) => <p className="form-message" role="alert" key={index}>{getErrorMessage(error, "Could not complete the extension request. Please try again.")}</p>)}
    {!canExtend && extensions.length === 0 && !booking.parentBooking && <p>Extensions can be requested by an administrator for confirmed, paid reservations.</p>}
  </section>;
}
