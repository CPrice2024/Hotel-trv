import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { api, getErrorMessage } from "../../api";

interface Session { id: string; user: { name: string; email: string; role: string } | null; browser: string; os: string; device: string; ip: string; createdAt: string; lastSeenAt: string; lastActivity: string; expiresAt: string; revokedAt: string | null; active: boolean; current: boolean }
interface Entry { id: string; actorName: string; actorEmail: string; action: string; targetId: string; browser: string; os: string; device: string; ip: string; createdAt: string }
interface Page<T> { total: number; page: number; pages: number; sessions?: T[]; entries?: T[] }
const time = (value: string) => new Date(value).toLocaleString();
function Pager({ page, pages, onChange }: { page: number; pages: number; onChange: (value: number) => void }) { return <div className="management-pagination"><span>Page {page} of {pages}</span><div><button disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button><button disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</button></div></div>; }

export function SecurityManagement() {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [notice, setNotice] = useState("");
  const sessions = useQuery({ queryKey: ["staff-security-sessions", page, status], queryFn: async () => (await api.get<Page<Session>>("/staff/security/sessions", { params: { page, status } })).data, refetchInterval: 30000 });
  const activity = useQuery({ queryKey: ["staff-security-activity", activityPage], queryFn: async () => (await api.get<Page<Entry>>("/staff/security/activity", { params: { page: activityPage } })).data, refetchInterval: 30000 });
  const refresh = () => { void client.invalidateQueries({ queryKey: ["staff-security-sessions"] }); void client.invalidateQueries({ queryKey: ["staff-security-activity"] }); };
  const revoke = useMutation({ mutationFn: (id: string) => api.post(`/staff/security/sessions/${id}/revoke`), onSuccess: () => { setNotice("Device signed out. Its next request will require sign-in."); refresh(); } });
  const others = useMutation({ mutationFn: async () => (await api.post<{ revoked: number }>("/staff/security/sessions/revoke-others")).data, onSuccess: data => { setNotice(`${data.revoked} of your other session(s) signed out. This device remains signed in.`); refresh(); } });
  return <>
    <div className="management-heading"><div><p className="eyebrow">Hotel security</p><h1>Sessions & activity</h1><p>See which staff account and device performed each recorded action.</p></div><div className="management-actions"><button className="management-button" onClick={refresh}><RefreshCw size={16} />Refresh</button><button className="management-button" disabled={others.isPending || revoke.isPending} onClick={() => others.mutate()}>Sign out my other sessions</button></div></div>
    {notice && <p className="management-success" role="status"><ShieldCheck size={17} />{notice}</p>}
    {[sessions.error, activity.error, revoke.error, others.error].filter(Boolean).map((error, index) => <p key={index} className="form-message" role="alert">{getErrorMessage(error, "Could not load or update security records.")}</p>)}
    <section className="management-panel"><div className="panel-heading"><h2>Recent device sessions</h2><span>Updated every 30 seconds</span></div>
      <div className="management-filters"><label>Session status <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="all">All recent sessions</option><option value="active">Active sessions</option><option value="ended">Ended sessions</option></select></label><span>{sessions.data?.total ?? 0} sessions</span></div>
      {sessions.isPending ? <div className="management-empty">Loading sessions...</div> : sessions.data?.sessions?.length ? <div className="table-wrap"><table><thead><tr><th>Account</th><th>Device / network</th><th>Signed in</th><th>Last seen / activity</th><th>Status</th><th>Manage</th></tr></thead><tbody>{sessions.data.sessions.map(s => <tr key={s.id}>
        <td><strong>{s.user?.name ?? "Deleted account"}</strong><small>{s.user?.email}</small><small>{s.user?.role}</small></td>
        <td><strong>{s.browser} on {s.os}</strong><small>{s.device} · {s.ip}</small>{s.current && <small>This device</small>}</td>
        <td>{time(s.createdAt)}</td><td>{time(s.lastSeenAt)}<small>{s.lastActivity}</small></td>
        <td><span className={`management-badge ${s.active ? "badge-confirmed" : "badge-cancelled"}`}>{s.active ? "Active session" : s.revokedAt ? "Signed out" : "Expired"}</span><small>{s.active ? `Expires ${time(s.expiresAt)}` : s.revokedAt ? time(s.revokedAt) : time(s.expiresAt)}</small></td>
        <td>{s.active && !s.current ? <button className="management-button" disabled={revoke.isPending || others.isPending} onClick={() => revoke.mutate(s.id)}>Sign out device</button> : s.current ? "Current session" : "—"}</td>
      </tr>)}</tbody></table></div> : <div className="management-empty">No sessions match this filter.</div>}
      {sessions.data && <Pager page={page} pages={sessions.data.pages} onChange={setPage} />}
    </section>
    <p className="management-footnote">Tracking starts after deployment. Existing users must sign in again once to register their device. Device details come from the browser; shared IP addresses do not identify an exact device or location. An active session may be idle. Ended sessions are kept for 30 days after expiry.</p>
    <section className="management-panel"><div className="panel-heading"><h2>Staff activity history</h2><span>Last 90 days</span></div>
      {activity.isPending ? <div className="management-empty">Loading activity...</div> : activity.data?.entries?.length ? <div className="table-wrap"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Device / network</th></tr></thead><tbody>{activity.data.entries.map(e => <tr key={e.id}>
        <td>{time(e.createdAt)}</td><td><strong>{e.actorName}</strong><small>{e.actorEmail}</small></td><td>{e.action}{e.targetId && <small>{/reservation|extension/i.test(e.action) ? <Link to={`/admin/reservations/${e.targetId}`}>Open reservation</Link> : e.targetId}</small>}</td><td>{e.browser} on {e.os}<small>{e.device} · {e.ip}</small></td>
      </tr>)}</tbody></table></div> : <div className="management-empty">No activity recorded yet. Successful sign-ins and management changes will appear here.</div>}
      {activity.data && <Pager page={activityPage} pages={activity.data.pages} onChange={setActivityPage} />}
    </section>
  </>;
}
