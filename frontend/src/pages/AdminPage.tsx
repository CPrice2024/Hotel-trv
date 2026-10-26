import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, BedDouble, CalendarDays, ChartNoAxesCombined, CreditCard, ExternalLink, LayoutDashboard, LogOut, Settings, ShieldCheck, Users, UserRoundCog } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api, getErrorMessage, type StaffUser } from "../api";
import { useStaffStore } from "../store";
import { BookingDetails, BookingManagement, GuestManagement, Overview, Reports, RoomManagement, StaffManagement, SystemSettings } from "./admin/AdminWorkspace";
import "./admin/AdminWorkspace.css";

const navigation = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard },
  { to: "/admin/rooms", label: "Rooms & rates", icon: BedDouble },
  { to: "/admin/reservations", label: "Reservations", icon: CalendarDays },
  { to: "/admin/guests", label: "Guest directory", icon: Users },
  { to: "/admin/payments", label: "Payments", icon: CreditCard },
  { to: "/admin/reports", label: "Reports", icon: ChartNoAxesCombined },
  { to: "/admin/staff", label: "Staff & access", icon: UserRoundCog, admin: true },
  { to: "/admin/settings", label: "Hotel settings", icon: Settings, admin: true },
];

export function AdminPage() {
  const { user, setUser } = useStaffStore();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const location = useLocation();
  const session = useQuery({ queryKey: ["staff-session"], queryFn: async () => (await api.get<{ user: StaffUser }>("/staff/me")).data.user, enabled: !user, retry: false });
  useEffect(() => { if (session.data) setUser(session.data); }, [session.data, setUser]);
  const login = useMutation({ mutationFn: async () => (await api.post<{ user: StaffUser }>("/staff/login", { email, password })).data.user, onSuccess: data => { setUser(data); setPassword(""); } });
  const logout = useMutation({ mutationFn: () => api.post("/staff/logout"), onSuccess: () => { setUser(null); queryClient.clear(); } });
  const onLogin = (event: FormEvent) => { event.preventDefault(); login.mutate(); };
  if (!user) return <main className="admin-login"><Link to="/" className="admin-brand">Ayele Degu <small>INTERNATIONAL HOTEL</small></Link><section className="login-card"><ShieldCheck className="admin-icon" /><p className="eyebrow">Hotel operations</p><h1>Welcome <em>back.</em></h1><p>Sign in to manage your hotel.</p>{session.isPending && session.isFetching ? <p role="status">Checking your session…</p> : <form onSubmit={onLogin}><label>Email<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>{login.isError && <p className="form-message" role="alert">{getErrorMessage(login.error, "Sign-in failed.")}</p>}<button className="button button-dark" disabled={login.isPending}>{login.isPending ? "Signing in…" : "Sign in"}<ArrowUpRight /></button></form>}</section></main>;
  const title = [...navigation].reverse().find(item => item.to === "/admin" ? location.pathname === "/admin" : location.pathname.startsWith(item.to))?.label ?? "Reservation details";
  return <div className="management-shell"><aside className="management-sidebar"><Link className="admin-brand" to="/admin">Ayele Degu<small>HOTEL OPERATIONS</small></Link><span className="management-nav-label">WORKSPACE</span><nav aria-label="Hotel management">{navigation.filter(item => !item.admin || user.role === "admin").map(item => <NavLink key={item.to} to={item.to} end={item.to === "/admin"}><item.icon size={19} /><span>{item.label}</span></NavLink>)}</nav><div className="management-sidebar-bottom"><Link to="/" target="_blank" rel="noreferrer"><ExternalLink size={17} /> View hotel website</Link><div className="management-account"><span className="account-avatar">{user.name.slice(0, 1)}</span><div><strong>{user.name}</strong><small>{user.role === "admin" ? "Administrator" : "Hotel staff"}</small></div></div><button type="button" onClick={() => logout.mutate()} disabled={logout.isPending}><LogOut size={17} />{logout.isPending ? "Signing out…" : "Sign out"}</button></div></aside><div className="management-main"><header className="management-topbar"><div><span>Workspace /</span> {title}</div><span className="management-role"><ShieldCheck size={15} />{user.role}</span></header><main className="management-content">{logout.isError && <p className="form-message" role="alert">{getErrorMessage(logout.error, "Sign out failed.")}</p>}<Routes><Route index element={<Overview />} /><Route path="rooms" element={<RoomManagement user={user} />} /><Route path="reservations" element={<BookingManagement />} /><Route path="reservations/:id" element={<BookingDetails />} /><Route path="guests" element={<GuestManagement />} /><Route path="payments" element={<BookingManagement payments />} /><Route path="reports" element={<Reports />} /><Route path="staff" element={user.role === "admin" ? <StaffManagement /> : <Navigate to="/admin" replace />} /><Route path="settings" element={user.role === "admin" ? <SystemSettings /> : <Navigate to="/admin" replace />} /><Route path="*" element={<Navigate to="/admin" replace />} /></Routes></main><footer className="management-footer">Ayele Degu International Hotel · Operations workspace</footer></div></div>;
}
