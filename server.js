const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const db = require("./db");

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const stripe = process.env.STRIPE_SECRET_KEY
  ? require("stripe")(process.env.STRIPE_SECRET_KEY)
  : null;

// Was jeder Plan darf. Hier neue Pro-Funktionen ergänzen.
const PLANS = {
  free: { name: "Gratis", invoicesPerMonth: 3, watermark: true, logo: false, csvExport: false },
  pro: { name: "Pro", invoicesPerMonth: Infinity, watermark: false, logo: true, csvExport: true },
};
const SESSION_DAYS = 30;
const MAX_LOGO_BYTES = 200 * 1024;

const app = express();

// ---------- Hilfsfunktionen ----------

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const test = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(test, Buffer.from(hash, "hex"));
}

function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = Date.now() + SESSION_DAYS * 864e5;
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, userId, expires);
  res.cookie("sid", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: BASE_URL.startsWith("https"),
    maxAge: SESSION_DAYS * 864e5,
  });
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header.split(";").map((c) => c.trim().split("=")).filter(([k]) => k).map(([k, v]) => [k, decodeURIComponent(v ?? "")])
  );
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
  if (!req.user) return res.status(401).json({ error: "Bitte einloggen." });
  next();
}

// JSON-only API: Browser können Cross-Site keine JSON-Requests ohne CORS senden,
// das schützt zusammen mit SameSite-Cookies vor CSRF.
function requireJson(req, res, next) {
  if (req.method !== "GET" && !req.is("application/json")) {
    return res.status(415).json({ error: "Content-Type muss application/json sein." });
  }
  next();
}

function invoicesThisMonth(userId) {
  return db.prepare(
    `SELECT COUNT(*) AS n FROM invoices
     WHERE user_id = ? AND created_at >= datetime('now', 'start of month')`
  ).get(userId).n;
}

function publicUser(user) {
  const plan = PLANS[user.plan] ?? PLANS.free;
  return {
    email: user.email,
    plan: user.plan,
    limits: { ...plan, invoicesPerMonth: Number.isFinite(plan.invoicesPerMonth) ? plan.invoicesPerMonth : null },
    usedThisMonth: invoicesThisMonth(user.id),
    company: JSON.parse(user.company),
    billingEnabled: Boolean(stripe),
  };
}

function setPlanBySubscription(sub) {
  const active = ["active", "trialing", "past_due"].includes(sub.status);
  db.prepare(
    `UPDATE users SET plan = ?, stripe_subscription_id = ? WHERE stripe_customer_id = ?`
  ).run(active ? "pro" : "free", sub.id, sub.customer);
}

// ---------- Stripe-Webhook (braucht den rohen Body, daher vor express.json) ----------

app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), (req, res) => {
  if (!stripe) return res.status(404).end();
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook-Fehler: ${err.message}`);
  }

  const obj = event.data.object;
  switch (event.type) {
    case "checkout.session.completed":
      if (obj.mode === "subscription") {
        db.prepare(
          `UPDATE users SET plan = 'pro', stripe_customer_id = ?, stripe_subscription_id = ? WHERE id = ?`
        ).run(obj.customer, obj.subscription, Number(obj.client_reference_id));
      }
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      setPlanBySubscription(obj);
      break;
  }
  res.json({ received: true });
});

app.use(express.json({ limit: "512kb" }));
app.use("/api", requireJson);

// ---------- Konto ----------

app.post("/api/register", (req, res) => {
  const email = String(req.body.email ?? "").trim().toLowerCase();
  const password = String(req.body.password ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Ungültige E-Mail." });
  if (password.length < 8) return res.status(400).json({ error: "Passwort muss mindestens 8 Zeichen haben." });
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
    return res.status(409).json({ error: "E-Mail ist bereits registriert." });
  }
  const { lastInsertRowid } = db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)").run(email, hashPassword(password));
  createSession(res, Number(lastInsertRowid));
  res.json({ ok: true });
});

app.post("/api/login", (req, res) => {
  const email = String(req.body.email ?? "").trim().toLowerCase();
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !verifyPassword(String(req.body.password ?? ""), user.password_hash)) {
    return res.status(401).json({ error: "E-Mail oder Passwort falsch." });
  }
  createSession(res, user.id);
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  const token = parseCookies(req.headers.cookie).sid;
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  res.clearCookie("sid");
  res.json({ ok: true });
});

app.get("/api/me", requireUser, (req, res) => res.json(publicUser(req.user)));

app.put("/api/company", requireUser, (req, res) => {
  const b = req.body;
  const company = {
    name: String(b.name ?? "").slice(0, 200),
    address: String(b.address ?? "").slice(0, 500),
    iban: String(b.iban ?? "").slice(0, 50),
    taxNumber: String(b.taxNumber ?? "").slice(0, 50),
    smallBusiness: Boolean(b.smallBusiness),
  };
  if (b.logo) {
    if (!PLANS[req.user.plan].logo) return res.status(403).json({ error: "Logo ist eine Pro-Funktion." });
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(b.logo) || b.logo.length > MAX_LOGO_BYTES * 1.37) {
      return res.status(400).json({ error: "Logo muss PNG/JPG/WebP und kleiner als 200 KB sein." });
    }
    company.logo = b.logo;
  }
  db.prepare("UPDATE users SET company = ? WHERE id = ?").run(JSON.stringify(company), req.user.id);
  res.json({ ok: true });
});

// ---------- Rechnungen ----------

function invoiceView(row, user) {
  const plan = PLANS[user.plan] ?? PLANS.free;
  const company = JSON.parse(user.company);
  if (!plan.logo) delete company.logo;
  return {
    id: row.id,
    number: row.number,
    date: row.date,
    customer: row.customer,
    items: JSON.parse(row.items),
    total: row.total_cents / 100,
    company,
    watermark: plan.watermark,
  };
}

app.get("/api/invoices", requireUser, (req, res) => {
  const rows = db.prepare("SELECT * FROM invoices WHERE user_id = ? ORDER BY id DESC").all(req.user.id);
  res.json(rows.map((r) => ({ id: r.id, number: r.number, date: r.date, customer: r.customer.split("\n")[0], total: r.total_cents / 100 })));
});

app.get("/api/invoices/:id", requireUser, (req, res) => {
  const row = db.prepare("SELECT * FROM invoices WHERE id = ? AND user_id = ?").get(Number(req.params.id), req.user.id);
  if (!row) return res.status(404).json({ error: "Nicht gefunden." });
  res.json(invoiceView(row, req.user));
});

app.post("/api/invoices", requireUser, (req, res) => {
  const plan = PLANS[req.user.plan] ?? PLANS.free;
  if (invoicesThisMonth(req.user.id) >= plan.invoicesPerMonth) {
    return res.status(402).json({ error: `Gratis-Limit erreicht (${plan.invoicesPerMonth} Rechnungen/Monat). Hol dir Pro für unbegrenzt viele.` });
  }
  const items = (Array.isArray(req.body.items) ? req.body.items : [])
    .map((i) => ({
      description: String(i.description ?? "").slice(0, 300),
      quantity: Number(i.quantity) || 0,
      price: Math.round((Number(i.price) || 0) * 100) / 100,
    }))
    .filter((i) => i.description)
    .slice(0, 100);
  if (!items.length) return res.status(400).json({ error: "Mindestens eine Position angeben." });
  const totalCents = Math.round(items.reduce((s, i) => s + i.quantity * i.price, 0) * 100);
  const number = String(req.body.number ?? "").slice(0, 50) || `${new Date().getFullYear()}-${Date.now() % 100000}`;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body.date) ? req.body.date : new Date().toISOString().slice(0, 10);
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO invoices (user_id, number, date, customer, items, total_cents) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(req.user.id, number, date, String(req.body.customer ?? "").slice(0, 500), JSON.stringify(items), totalCents);
  res.json({ id: Number(lastInsertRowid) });
});

app.delete("/api/invoices/:id", requireUser, (req, res) => {
  db.prepare("DELETE FROM invoices WHERE id = ? AND user_id = ?").run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

app.get("/api/export.csv", requireUser, (req, res) => {
  if (!PLANS[req.user.plan].csvExport) return res.status(403).json({ error: "CSV-Export ist eine Pro-Funktion." });
  const rows = db.prepare("SELECT * FROM invoices WHERE user_id = ? ORDER BY date").all(req.user.id);
  const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = ["Nummer;Datum;Kunde;Betrag"]
    .concat(rows.map((r) => [r.number, r.date, r.customer.split("\n")[0], (r.total_cents / 100).toFixed(2).replace(".", ",")].map(cell).join(";")))
    .join("\n");
  res.type("text/csv").attachment("rechnungen.csv").send("﻿" + csv);
});

// ---------- Abo ----------

app.post("/api/checkout", requireUser, async (req, res) => {
  if (!stripe) {
    // Testmodus ohne Stripe-Key: Pro direkt freischalten.
    db.prepare("UPDATE users SET plan = 'pro' WHERE id = ?").run(req.user.id);
    return res.json({ url: "/app.html?upgraded=1" });
  }
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    client_reference_id: String(req.user.id),
    ...(req.user.stripe_customer_id ? { customer: req.user.stripe_customer_id } : { customer_email: req.user.email }),
    allow_promotion_codes: true,
    success_url: `${BASE_URL}/app.html?upgraded=1`,
    cancel_url: `${BASE_URL}/app.html`,
  });
  res.json({ url: session.url });
});

app.post("/api/portal", requireUser, async (req, res) => {
  if (!stripe) {
    db.prepare("UPDATE users SET plan = 'free' WHERE id = ?").run(req.user.id);
    return res.json({ url: "/app.html" });
  }
  if (!req.user.stripe_customer_id) return res.status(400).json({ error: "Kein Abo vorhanden." });
  const portal = await stripe.billingPortal.sessions.create({
    customer: req.user.stripe_customer_id,
    return_url: `${BASE_URL}/app.html`,
  });
  res.json({ url: portal.url });
});

app.use(express.static(path.join(__dirname, "public")));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Serverfehler." });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Läuft auf ${BASE_URL}${stripe ? "" : "  (Testmodus: kein Stripe-Key, Pro ist gratis)"}`);
  });
}

module.exports = app;
