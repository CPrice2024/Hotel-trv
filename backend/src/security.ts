import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { ActivityLog, StaffSession } from "./db/models.js";

const wrap = (fn: RequestHandler): RequestHandler => (req, res, next) => { Promise.resolve(fn(req, res, next)).catch(next); };
const pageInput = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), status: z.enum(["all", "active", "ended"]).default("all") });
export function createSecurityRouter(authorize: RequestHandler) {
  const router = Router();
  router.use(authorize);
  router.get("/sessions", wrap(async (req, res) => {
    const parsed = pageInput.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: "Invalid session filters." }); return; }
    const now = new Date();
    const filter = parsed.data.status === "active" ? { revokedAt: null, expiresAt: { $gt: now } } : parsed.data.status === "ended" ? { $or: [{ revokedAt: { $ne: null } }, { expiresAt: { $lte: now } }] } : {};
    const [total, sessions] = await Promise.all([
      StaffSession.countDocuments(filter),
      StaffSession.find(filter).populate<{ user: { name: string; email: string; role: string } | null }>("user", "name email role").sort({ lastSeenAt: -1, _id: -1 }).skip((parsed.data.page - 1) * 20).limit(20).lean(),
    ]);
    res.json({ total, page: parsed.data.page, pages: Math.max(1, Math.ceil(total / 20)), sessions: sessions.map(s => ({ id: s._id.toString(), user: s.user ? { name: s.user.name, email: s.user.email, role: s.user.role } : null, browser: s.browser, os: s.os, device: s.device, ip: s.ip, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, lastActivity: s.lastActivity, expiresAt: s.expiresAt, revokedAt: s.revokedAt, current: s._id.toString() === res.locals.staffSession.id, active: !s.revokedAt && s.expiresAt > now })) });
  }));
  router.post("/sessions/revoke-others", wrap(async (_req, res) => {
    const result = await StaffSession.updateMany({ user: res.locals.staff.id, _id: { $ne: res.locals.staffSession.id }, revokedAt: null, expiresAt: { $gt: new Date() } }, { $set: { revokedAt: new Date() } });
    res.json({ revoked: result.modifiedCount });
  }));
  router.post("/sessions/:id/revoke", wrap(async (req, res) => {
    if (typeof req.params.id !== "string" || !/^[a-f\d]{24}$/i.test(req.params.id)) { res.status(400).json({ error: "Invalid session identifier." }); return; }
    if (req.params.id === res.locals.staffSession.id) { res.status(409).json({ error: "Use Sign out to end your current session." }); return; }
    const result = await StaffSession.updateOne({ _id: req.params.id, revokedAt: null, expiresAt: { $gt: new Date() } }, { $set: { revokedAt: new Date() } });
    if (!result.matchedCount) { res.status(404).json({ error: "This session has already ended or was not found." }); return; }
    res.json({ revoked: true });
  }));
  router.get("/activity", wrap(async (req, res) => {
    const parsed = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1) }).safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: "Invalid activity page." }); return; }
    const [total, entries] = await Promise.all([ActivityLog.countDocuments({}), ActivityLog.find().sort({ createdAt: -1, _id: -1 }).skip((parsed.data.page - 1) * 20).limit(20).lean()]);
    res.json({ total, page: parsed.data.page, pages: Math.max(1, Math.ceil(total / 20)), entries: entries.map(e => ({ id: e._id.toString(), actorName: e.actorName, actorEmail: e.actorEmail, action: e.action, targetId: e.targetId, browser: e.browser, os: e.os, device: e.device, ip: e.ip, createdAt: e.createdAt })) });
  }));
  return router;
}
