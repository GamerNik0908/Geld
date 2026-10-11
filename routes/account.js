const express = require("express");
const db = require("../db");
const auth = require("../lib/auth");
const { TRIAL_DAYS, effectivePlan, limitsFor, serializeLimits, PRICES } = require("../lib/plans");
const { readSettings } = require("../lib/settings");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = function accountRoutes({ secureCookies, billingEnabled }) {
  const router = express.Router();
  const limiter = auth.rateLimit({ windowMs: 15 * 60e3, max: 20 });

  router.get("/prices", (req, res) => res.json(PRICES));

  router.post("/register", limiter, (req, res) => {
    const email = String(req.body.email ?? "").trim().toLowerCase();
    const password = String(req.body.password ?? "");
    if (!EMAIL_RE.test(email) || email.length > 200) return res.status(400).json({ error: "Bitte gib eine gültige E-Mail-Adresse ein." });
    if (password.length < 8) return res.status(400).json({ error: "Das Passwort muss mindestens 8 Zeichen lang sein." });
    if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
      return res.status(409).json({ error: "Diese E-Mail-Adresse ist bereits registriert." });
    }
    const { lastInsertRowid } = db.prepare("INSERT INTO users (email, password_hash, trial_ends_at, settings) VALUES (?, ?, ?, ?)")
      .run(email, auth.hashPassword(password), Date.now() + TRIAL_DAYS * 864e5, JSON.stringify({ email }));
    auth.createSession(res, Number(lastInsertRowid), secureCookies);
    res.json({ ok: true });
  });

  router.post("/login", limiter, (req, res) => {
    const email = String(req.body.email ?? "").trim().toLowerCase();
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user || !auth.verifyPassword(String(req.body.password ?? ""), user.password_hash)) {
      return res.status(401).json({ error: "E-Mail oder Passwort ist falsch." });
    }
    auth.createSession(res, user.id, secureCookies);
    res.json({ ok: true });
  });

  router.post("/logout", (req, res) => {
    auth.destroySession(req, res);
    res.json({ ok: true });
  });

  router.get("/me", auth.requireUser, (req, res) => {
    const u = req.user;
    const count = (sql) => db.prepare(sql).get(u.id).n;
    res.json({
      email: u.email,
      plan: effectivePlan(u),
      subscribed: u.plan === "pro",
      trialEndsAt: u.plan !== "pro" && u.trial_ends_at > Date.now() ? u.trial_ends_at : null,
      limits: serializeLimits(limitsFor(u)),
      usage: {
        docsThisMonth: count("SELECT COUNT(*) AS n FROM documents WHERE user_id = ? AND created_at >= datetime('now', 'start of month')"),
        customers: count("SELECT COUNT(*) AS n FROM customers WHERE user_id = ?"),
        products: count("SELECT COUNT(*) AS n FROM products WHERE user_id = ?"),
        documents: count("SELECT COUNT(*) AS n FROM documents WHERE user_id = ?"),
      },
      settings: readSettings(u),
      billingEnabled,
      prices: PRICES,
    });
  });

  router.post("/password", auth.requireUser, limiter, (req, res) => {
    const { current, next } = req.body;
    if (!auth.verifyPassword(String(current ?? ""), req.user.password_hash)) return res.status(400).json({ error: "Das aktuelle Passwort ist falsch." });
    if (String(next ?? "").length < 8) return res.status(400).json({ error: "Das neue Passwort muss mindestens 8 Zeichen lang sein." });
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(auth.hashPassword(String(next)), req.user.id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(req.user.id);
    auth.createSession(res, req.user.id, secureCookies);
    res.json({ ok: true });
  });

  // DSGVO: alle eigenen Daten als JSON herunterladen
  router.get("/export.json", auth.requireUser, (req, res) => {
    const id = req.user.id;
    const data = {
      exportedAt: new Date().toISOString(),
      account: { email: req.user.email, createdAt: req.user.created_at, settings: readSettings(req.user) },
      customers: db.prepare("SELECT * FROM customers WHERE user_id = ?").all(id),
      products: db.prepare("SELECT * FROM products WHERE user_id = ?").all(id),
      documents: db.prepare("SELECT * FROM documents WHERE user_id = ?").all(id).map((d) => ({ ...d, items: JSON.parse(d.items) })),
    };
    res.attachment("meine-daten.json").json(data);
  });

  router.delete("/account", auth.requireUser, (req, res) => {
    if (!auth.verifyPassword(String(req.body.password ?? ""), req.user.password_hash)) {
      return res.status(400).json({ error: "Das Passwort ist falsch." });
    }
    if (req.user.plan === "pro") {
      return res.status(409).json({ error: "Bitte kündige zuerst dein Pro-Abo unter „Abo & Rechnungen“." });
    }
    db.prepare("DELETE FROM users WHERE id = ?").run(req.user.id);
    res.clearCookie("sid");
    res.json({ ok: true });
  });

  return router;
};
