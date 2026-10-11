const crypto = require("node:crypto");
const db = require("../db");

const SESSION_DAYS = 30;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  return crypto.timingSafeEqual(crypto.scryptSync(password, salt, 64), Buffer.from(hash, "hex"));
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header.split(";").map((c) => c.trim().split("=")).filter(([k]) => k).map(([k, v]) => [k, decodeURIComponent(v ?? "")])
  );
}

function createSession(res, userId, secure) {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .run(token, userId, Date.now() + SESSION_DAYS * 864e5);
  res.cookie("sid", token, { httpOnly: true, sameSite: "lax", secure, maxAge: SESSION_DAYS * 864e5 });
}

function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie).sid;
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  res.clearCookie("sid");
}

function currentUser(req) {
  const token = parseCookies(req.headers.cookie).sid;
  if (!token) return null;
  return db.prepare(
    `SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.token = ? AND sessions.expires_at > ?`
  ).get(token, Date.now()) ?? null;
}

function requireUser(req, res, next) {
  req.user = currentUser(req);
  if (!req.user) return res.status(401).json({ error: "Bitte melde dich an." });
  next();
}

function purgeExpiredSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
}

// Einfache Begrenzung pro IP, z. B. gegen das Durchprobieren von Passwörtern.
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs).unref();
  return (req, res, next) => {
    const n = (hits.get(req.ip) || 0) + 1;
    hits.set(req.ip, n);
    if (n > max) return res.status(429).json({ error: "Zu viele Versuche. Bitte warte ein paar Minuten." });
    next();
  };
}

module.exports = {
  hashPassword, verifyPassword, createSession, destroySession, currentUser, requireUser,
  purgeExpiredSessions, rateLimit, parseCookies,
};
