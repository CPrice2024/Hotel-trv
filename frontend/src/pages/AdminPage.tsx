import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, LogOut, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { api, getErrorMessage, type BookingRecord, type Room, type StaffUser } from "../api";
import { useStaffStore } from "../store";
import { SiteHeader } from "./SiteHeader";

interface DashboardData {
  metrics: {
    activeRooms: number;
    bookings: number;
    pending: number;
    revenueETB: number;
    revenueUSD: number;
  };
  bookings: BookingRecord[];
}

interface RoomFields {
  name: string;
  description: string;
  imageUrl: string;
  inventory: string;
  maxGuests: string;
  priceETB: string;
  priceUSD: string;
}

const blankRoom: RoomFields = {
  name: "",
  description: "",
  imageUrl: "",
  inventory: "1",
  maxGuests: "2",
  priceETB: "",
  priceUSD: "",
};

export function AdminPage() {
  const queryClient = useQueryClient();
  const { user, setUser } = useStaffStore();
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [pageError, setPageError] = useState("");
  const [roomFields, setRoomFields] = useState(blankRoom);
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [staffFields, setStaffFields] = useState({ name: "", email: "", password: "", role: "staff" });
  const [showStaffForm, setShowStaffForm] = useState(false);

  const staffQuery = useQuery({
    queryKey: ["staff-session"],
    queryFn: async () => (await api.get<{ user: StaffUser }>("/staff/me")).data.user,
    enabled: !user,
    retry: false,
  });

  useEffect(() => {
    if (staffQuery.data) setUser(staffQuery.data);
  }, [staffQuery.data, setUser]);

  const dashboardQuery = useQuery({
    queryKey: ["staff-dashboard"],
    queryFn: async () => (await api.get<DashboardData>("/staff/dashboard")).data,
    enabled: Boolean(user),
  });
  const roomsQuery = useQuery({
    queryKey: ["staff-rooms"],
    queryFn: async () => (await api.get<{ rooms: Room[] }>("/staff/rooms")).data.rooms,
    enabled: Boolean(user),
  });

  const loginMutation = useMutation({
    mutationFn: async () =>
      (await api.post<{ user: StaffUser }>("/staff/login", {
        email: loginEmail,
        password: loginPassword,
      })).data.user,
    onSuccess: (loggedInUser) => {
      setUser(loggedInUser);
      setPageError("");
    },
    onError: (error) => setPageError(getErrorMessage(error, "Sign-in failed.")),
  });
  const logoutMutation = useMutation({
    mutationFn: () => api.post("/staff/logout"),
    onSuccess: () => {
      setUser(null);
      queryClient.clear();
    },
    onError: (error) => setPageError(getErrorMessage(error, "Could not sign out.")),
  });
  const createRoomMutation = useMutation({
    mutationFn: async () =>
      api.post("/staff/rooms", {
        ...roomFields,
        inventory: Number(roomFields.inventory),
        maxGuests: Number(roomFields.maxGuests),
        priceETB: Number(roomFields.priceETB),
        priceUSD: Number(roomFields.priceUSD),
      }),
    onSuccess: () => {
      setRoomFields(blankRoom);
      setShowRoomForm(false);
      setPageError("");
      void queryClient.invalidateQueries({ queryKey: ["staff-rooms"] });
      void queryClient.invalidateQueries({ queryKey: ["rooms"] });
      void queryClient.invalidateQueries({ queryKey: ["staff-dashboard"] });
    },
    onError: (error) => setPageError(getErrorMessage(error, "The room could not be saved.")),
  });
  const changeRoomStatus = useMutation({
    mutationFn: ({ room, active }: { room: Room; active: boolean }) =>
      api.patch(`/staff/rooms/${room.id}`, { active }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["staff-rooms"] });
      void queryClient.invalidateQueries({ queryKey: ["rooms"] });
    },
    onError: (error) => setPageError(getErrorMessage(error, "The room could not be updated.")),
  });
  const cancelBooking = useMutation({
    mutationFn: (bookingId: string) => api.patch(`/staff/bookings/${bookingId}/cancel`),
    onSuccess: () => {
      setPageError("");
      void queryClient.invalidateQueries({ queryKey: ["staff-dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["staff-rooms"] });
    },
    onError: (error) => setPageError(getErrorMessage(error, "The booking could not be cancelled.")),
  });
  const createStaff = useMutation({
    mutationFn: () =>
      api.post("/staff/users", {
        ...staffFields,
        role: staffFields.role,
      }),
    onSuccess: () => {
      setStaffFields({ name: "", email: "", password: "", role: "staff" });
      setShowStaffForm(false);
      setPageError("Staff account created.");
    },
    onError: (error) => setPageError(getErrorMessage(error, "Staff account could not be created.")),
  });

  const submitLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    loginMutation.mutate();
  };
  const submitRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createRoomMutation.mutate();
  };
  const submitStaff = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createStaff.mutate();
  };

  return (
    <>
      <SiteHeader />
      <main className="app-page admin-page">
        <div className="section-wrap">
          {!user ? (
            <section className="login-card">
              <ShieldCheck className="admin-icon" aria-hidden="true" />
              <p className="eyebrow">Team access</p>
              <h1>Hotel <em>dashboard.</em></h1>
              <p>Sign in with an account created by the hotel administrator.</p>
              <form onSubmit={submitLogin}>
                <label>Email<input type="email" autoComplete="username" required value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} /></label>
                <label>Password<input type="password" autoComplete="current-password" required value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} /></label>
                {pageError && <p className="form-message" role="alert">{pageError}</p>}
                <button className="button button-dark" type="submit" disabled={loginMutation.isPending}>
                  {loginMutation.isPending ? "Signing in…" : "Sign in"} <ArrowUpRight aria-hidden="true" />
                </button>
              </form>
            </section>
          ) : (
            <>
              <div className="admin-heading">
                <div>
                  <p className="eyebrow">Hotel operations</p>
                  <h1>Welcome, <em>{user.name.split(" ")[0]}.</em></h1>
                  <p>{user.email} · {user.role}</p>
                </div>
                <button className="button button-outline" type="button" onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}>
                  <LogOut aria-hidden="true" /> Sign out
                </button>
              </div>
              {pageError && <p className="form-message" role="alert">{pageError}</p>}
              {dashboardQuery.isLoading && <p>Loading hotel operations…</p>}
              {dashboardQuery.isError && <p className="form-message">Dashboard data could not be loaded. Refresh to try again.</p>}
              {dashboardQuery.data && (
                <>
                  <section className="metric-grid" aria-label="Hotel summary">
                    <article><span>Active room types</span><strong>{dashboardQuery.data.metrics.activeRooms}</strong></article>
                    <article><span>Total bookings</span><strong>{dashboardQuery.data.metrics.bookings}</strong></article>
                    <article><span>Pending holds</span><strong>{dashboardQuery.data.metrics.pending}</strong></article>
                    <article><span>Paid revenue · ETB</span><strong>{dashboardQuery.data.metrics.revenueETB.toLocaleString()}</strong></article>
                    <article><span>Paid revenue · USD</span><strong>${dashboardQuery.data.metrics.revenueUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></article>
                  </section>

                  <section className="admin-section">
                    <div className="admin-section-heading">
                      <div><p className="eyebrow">Rates and inventory</p><h2>Room types</h2></div>
                      {user.role === "admin" && (
                        <button className="button button-dark" type="button" onClick={() => setShowRoomForm((value) => !value)}>
                          <Plus aria-hidden="true" /> Add room
                        </button>
                      )}
                    </div>
                    {showRoomForm && (
                      <form className="admin-form" onSubmit={submitRoom}>
                        <label>Room type name<input required minLength={2} value={roomFields.name} onChange={(event) => setRoomFields({ ...roomFields, name: event.target.value })} /></label>
                        <label>Description<textarea required minLength={5} value={roomFields.description} onChange={(event) => setRoomFields({ ...roomFields, description: event.target.value })} /></label>
                        <label>Photo URL<input type="url" value={roomFields.imageUrl} onChange={(event) => setRoomFields({ ...roomFields, imageUrl: event.target.value })} /></label>
                        <div className="form-grid">
                          <label>Rooms in inventory<input required type="number" min="1" max="500" value={roomFields.inventory} onChange={(event) => setRoomFields({ ...roomFields, inventory: event.target.value })} /></label>
                          <label>Guests per room<input required type="number" min="1" max="12" value={roomFields.maxGuests} onChange={(event) => setRoomFields({ ...roomFields, maxGuests: event.target.value })} /></label>
                          <label>Rate per night · ETB<input type="number" min="0" step="1" value={roomFields.priceETB} onChange={(event) => setRoomFields({ ...roomFields, priceETB: event.target.value })} /></label>
                          <label>Rate per night · USD<input required type="number" min="0.50" step="0.01" value={roomFields.priceUSD} onChange={(event) => setRoomFields({ ...roomFields, priceUSD: event.target.value })} /></label>
                        </div>
                        <p className="contact-note">Enter room prices separately; no exchange rate is applied. Leave ETB at 0 until the actual rate is confirmed.</p>
                        <button className="button button-dark" type="submit" disabled={createRoomMutation.isPending}>{createRoomMutation.isPending ? "Saving…" : "Save room type"}</button>
                      </form>
                    )}
                    {roomsQuery.data?.length ? (
                      <div className="table-wrap">
                        <table>
                          <thead><tr><th>Room</th><th>Inventory</th><th>Capacity</th><th>ETB / night</th><th>USD / night</th><th>Status</th>{user.role === "admin" && <th>Action</th>}</tr></thead>
                          <tbody>{roomsQuery.data.map((room) => (
                            <tr key={room.id}>
                              <td>{room.name}{room.testOnly && <span className="status-pill status-inactive"> Test data</span>}</td><td>{room.inventory}</td><td>{room.maxGuests}</td>
                              <td>{room.priceETB > 0 ? room.priceETB.toLocaleString() : "Not set"}</td><td>${room.priceUSD.toFixed(2)}</td>
                              <td><span className={`status-pill ${room.active ? "status-active" : "status-inactive"}`}>{room.active ? "Active" : "Hidden"}</span></td>
                              {user.role === "admin" && <td><button className="table-action" type="button" onClick={() => changeRoomStatus.mutate({ room, active: !room.active })}>{room.active ? "Hide" : "Publish"}</button></td>}
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    ) : <p className="empty-state">No room types yet. Add your room types and separate ETB/USD rates to accept bookings.</p>}
                  </section>

                  <section className="admin-section">
                    <div className="admin-section-heading">
                      <div><p className="eyebrow">Reservations</p><h2>Recent bookings</h2></div>
                      <button className="table-action" type="button" onClick={() => void dashboardQuery.refetch()}><RefreshCw aria-hidden="true" /> Refresh</button>
                    </div>
                    {dashboardQuery.data.bookings.length ? (
                      <div className="table-wrap">
                        <table>
                          <thead><tr><th>Guest</th><th>Room</th><th>Dates</th><th>Rooms</th><th>Total</th><th>Payment</th><th>Status</th><th>Action</th></tr></thead>
                          <tbody>{dashboardQuery.data.bookings.map((booking) => (
                            <tr key={booking.id}>
                              <td>{booking.guestName}<small>{booking.guestEmail}<br />{booking.guestPhone}</small></td>
                              <td>{booking.roomName}</td>
                              <td>{new Date(booking.checkIn).toLocaleDateString()}–{new Date(booking.checkOut).toLocaleDateString()}</td>
                              <td>{booking.quantity} / {booking.guests} guests</td>
                              <td>{booking.currency} {booking.currency === "USD" ? (booking.totalMinor / 100).toFixed(2) : booking.totalMinor.toLocaleString()}</td>
                              <td>{booking.paymentStatus}</td>
                              <td><span className={`status-pill status-${booking.status}`}>{booking.refundRequired ? "refund needed" : booking.status}</span></td>
                              <td>{booking.status === "pending" && <button className="table-action danger-action" type="button" onClick={() => cancelBooking.mutate(booking.id)} disabled={cancelBooking.isPending}>Cancel</button>}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    ) : <p className="empty-state">No reservations yet.</p>}
                  </section>

                  {user.role === "admin" && (
                    <section className="admin-section">
                      <div className="admin-section-heading">
                        <div><p className="eyebrow">Access control</p><h2>Staff accounts</h2></div>
                        <button className="button button-outline" type="button" onClick={() => setShowStaffForm((value) => !value)}><Plus aria-hidden="true" /> Add staff</button>
                      </div>
                      {showStaffForm && (
                        <form className="admin-form compact-form" onSubmit={submitStaff}>
                          <label>Name<input required minLength={2} value={staffFields.name} onChange={(event) => setStaffFields({ ...staffFields, name: event.target.value })} /></label>
                          <label>Email<input required type="email" value={staffFields.email} onChange={(event) => setStaffFields({ ...staffFields, email: event.target.value })} /></label>
                          <label>Temporary password<input required minLength={12} type="password" value={staffFields.password} onChange={(event) => setStaffFields({ ...staffFields, password: event.target.value })} /></label>
                          <label>Role<select value={staffFields.role} onChange={(event) => setStaffFields({ ...staffFields, role: event.target.value })}><option value="staff">Staff</option><option value="admin">Administrator</option></select></label>
                          <button className="button button-dark" type="submit" disabled={createStaff.isPending}>{createStaff.isPending ? "Creating…" : "Create account"}</button>
                        </form>
                      )}
                    </section>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </main>
      <footer className="site-footer"><a className="brand footer-brand" href="/">Ayele Degu International Hotel</a><p>Authorized staff only</p></footer>
    </>
  );
}
