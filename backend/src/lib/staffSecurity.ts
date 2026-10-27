import type { Request, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { ActivityLog, StaffSession, User } from "../db/models.js";

export function deviceDetails(agent: string) {
  const browser = /Edg\//.test(agent) ? "Edge" : /OPR\//.test(agent) ? "Opera" : /Firefox\/|FxiOS\//.test(agent) ? "Firefox" : /Chrome\/|CriOS\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : "Unknown browser";
  const os = /Android/.test(agent) ? "Android" : /iPhone|iPad|iPod/.test(agent) ? "iOS" : /Windows/.test(agent) ? "Windows" : /Macintosh|Mac OS X/.test(agent) ? "macOS" : /Linux/.test(agent) ? "Linux" : "Unknown OS";
  const device = /iPad|Tablet/.test(agent) || (/Android/.test(agent) && !/Mobile/.test(agent)) ? "Tablet" : /Mobi|iPhone|iPod/.test(agent) ? "Phone" : "Computer";
  return { browser, os, device };
}

// Only known routes are recorded. Never store request bodies, passwords, tokens, or search queries.
export function staffAction(method: string, path: string): { action: string; targetId: string; audit: boolean } | null {
  const normalized = path.replace(/^\/api/, "").replace(/\/$/, "");
  const routes: [string, RegExp, string][] = [
    ["POST", /^\/staff\/login$/, "Signed in"], ["POST", /^\/staff\/logout$/, "Signed out"],
    ["PUT", /^\/staff\/rooms\/([a-f\d]{24})$/i, "Updated room details, rates or capacity"],
    ["PATCH", /^\/staff\/rooms\/([a-f\d]{24})$/i, "Changed room publication"],
    ["POST", /^\/staff\/rooms$/, "Created room type"],
    ["PATCH", /^\/staff\/bookings\/([a-f\d]{24})\/cancel$/i, "Cancelled reservation"],
    ["POST", /^\/staff\/bookings\/([a-f\d]{24})\/extensions$/i, "Created extension payment request"],
    ["POST", /^\/staff\/bookings\/([a-f\d]{24})\/payment-request-email$/i, "Resent extension payment email"],
    ["POST", /^\/staff\/users$/, "Created staff account"],
    ["PATCH", /^\/staff\/users\/([a-f\d]{24})$/i, "Changed staff account access"],
    ["POST", /^\/staff\/security\/sessions\/revoke-others$/, "Signed out own other sessions"],
    ["POST", /^\/staff\/security\/sessions\/([a-f\d]{24})\/revoke$/i, "Signed out a device"],
  ];
  for (const [verb, pattern, action] of routes) {
    const match = method === verb ? pattern.exec(normalized) : null;
    if (match) return { action, targetId: match[1] ?? "", audit: true };
  }
  if (method === "POST" && /^\/staff\/bookings\/[a-f\d]{24}\/extensions\/quote$/i.test(normalized)) return { action: "Previewed stay extension", targetId: normalized.split("/")[3], audit: false };
  if (method === "GET") {
    const match = /^\/staff\/bookings\/([a-f\d]{24})$/i.exec(normalized);
    if (match) return { action: "Viewed reservation", targetId: match[1], audit: false };
    const views: Record<string, string> = { "/staff/dashboard": "Viewed overview", "/staff/rooms": "Viewed rooms", "/staff/bookings": "Viewed reservations", "/staff/guests": "Viewed guest directory", "/staff/reports": "Viewed reports", "/staff/users": "Viewed staff accounts", "/staff/security/sessions": "Viewed device sessions", "/staff/security/activity": "Viewed activity history" };
    if (views[normalized]) return { action: views[normalized], targetId: "", audit: false };
  }
  return null;
}

export function sessionMetadata(req: Request) {
  return { ...deviceDetails((req.get("user-agent") ?? "").slice(0, 1000)), ip: (req.ip ?? "Unknown").slice(0, 100) };
}

export function createStaffAuthentication(secret: string, cookieName: string) {
  return (roles: ("admin" | "staff")[] = ["admin", "staff"]): RequestHandler => async (req, res, next) => {
    try {
      if (res.locals.staff && res.locals.staffSession) {
        if (!roles.includes(res.locals.staff.role)) { res.status(403).json({ error: "You do not have permission for this action." }); return; }
        next(); return;
      }
      const token = req.cookies?.[cookieName];
      if (typeof token !== "string") { res.status(401).json({ error: "Please sign in to continue." }); return; }
      const decoded = jwt.verify(token, secret, { issuer: "ayele-hotel", audience: "ayele-hotel-staff", algorithms: ["HS256"] });
      if (typeof decoded === "string" || typeof decoded.sub !== "string" || !/^[a-f\d]{24}$/i.test(decoded.sub) || typeof decoded.jti !== "string" || !/^[a-f\d]{24}$/i.test(decoded.jti)) {
        res.status(401).json({ error: "Please sign in again to register this device session." }); return;
      }
      const session = await StaffSession.findOne({ _id: decoded.jti, user: decoded.sub, revokedAt: null, expiresAt: { $gt: new Date() } }).lean();
      if (!session) { res.status(401).json({ error: "This session has ended. Please sign in again." }); return; }
      const staff = await User.findOne({ _id: decoded.sub, active: true }).select("_id name email role");
      if (!staff) { res.status(401).json({ error: "This account is no longer active." }); return; }
      if (!roles.includes(staff.role)) { res.status(403).json({ error: "You do not have permission for this action." }); return; }
      res.locals.staff = { id: staff._id.toString(), role: staff.role, name: staff.name, email: staff.email };
      res.locals.staffSession = { id: decoded.jti, browser: session.browser, os: session.os, device: session.device, ip: session.ip };
      // A heartbeat updates last-seen without overwriting the last successful action.
      await StaffSession.updateOne({ _id: decoded.jti, revokedAt: null }, { $set: { lastSeenAt: new Date() } });
      next();
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) { res.status(401).json({ error: "Your session has expired. Please sign in again." }); return; }
      next(error);
    }
  };
}

export const trackStaffActivity: RequestHandler = (req, res, next) => {
  // Capture before Express routers temporarily trim req.url.
  const action = staffAction(req.method, req.path);
  if (action) res.on("finish", () => {
    const actor = res.locals.staff;
    const session = res.locals.staffSession;
    if (!actor || !session || res.statusCode < 200 || res.statusCode >= 300) return;
    void Promise.all([
      StaffSession.updateOne({ _id: session.id }, { $set: { lastActivity: action.action } }),
      ...(action.audit ? [ActivityLog.create({ actor: actor.id, actorName: actor.name, actorEmail: actor.email, session: session.id, action: action.action, targetId: action.targetId, browser: session.browser, os: session.os, device: session.device, ip: session.ip })] : []),
    ]).catch(error => console.error("Could not record staff activity:", error));
  });
  next();
};
