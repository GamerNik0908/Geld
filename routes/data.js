const express = require("express");
const db = require("../db");
const calc = require("../lib/calc");
const { requireUser } = require("../lib/auth");
const { limitsFor } = require("../lib/plans");
const { readSettings, sanitizeSettings, formatNumber } = require("../lib/settings");
const { renderPdf } = require("../lib/pdf");

const TAX_RATES = [0, 7, 19];
const STATUSES = { invoice: ["open", "paid", "cancelled"], quote: ["open", "accepted", "declined"] };
const MAX_LOGO_CHARS = 400 * 1024;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const str = (v, max) => String(v ?? "").trim().slice(0, max);
const isoDate = (v) => (ISO_DATE.test(v) ? v : "");
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso, days) => new Date(new Date(iso + "T00:00:00Z").getTime() + days * 864e5).toISOString().slice(0, 10);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = function dataRoutes({ appName }) {
  const router = express.Router();
  router.use(requireUser);

  const own = (table, id, userId) => db.prepare(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`).get(Number(id), userId);

  function docsThisMonth(userId) {
    return db.prepare("SELECT COUNT(*) AS n FROM documents WHERE user_id = ? AND created_at >= datetime('now', 'start of month')").get(userId).n;
  }

  function assertDocQuota(user) {
    const { docsPerMonth } = limitsFor(user);
    if (docsThisMonth(user.id) >= docsPerMonth) {
      throw new HttpError(402, `Im Starter-Plan sind ${docsPerMonth} Belege pro Monat enthalten. Mit Pro schreibst du unbegrenzt viele.`);
    }
  }

  // ---------- Einstellungen ----------

  router.put("/settings", (req, res) => {
    const current = readSettings(req.user);
    const next = sanitizeSettings(req.body, current);
    if ("logo" in req.body) {
      const logo = String(req.body.logo ?? "");
      if (logo && !limitsFor(req.user).branding) throw new HttpError(403, "Ein eigenes Logo ist eine Pro-Funktion.");
      if (logo && (!/^data:image\/(png|jpeg);base64,/.test(logo) || logo.length > MAX_LOGO_CHARS)) {
        throw new HttpError(400, "Das Logo muss ein PNG oder JPG unter 300 KB sein.");
      }
      next.logo = logo;
    }
    db.prepare("UPDATE users SET settings = ? WHERE id = ?").run(JSON.stringify(next), req.user.id);
    res.json(next);
  });

  // ---------- Kunden & Produkte ----------

  const catalogs = {
    customers: {
      limit: "maxCustomers",
      label: "Kunden",
      fields: (b) => ({ name: str(b.name, 160), contact: str(b.contact, 120), address: str(b.address, 300), email: str(b.email, 160), vat_id: str(b.vat_id, 20) }),
      order: "name COLLATE NOCASE",
    },
    products: {
      limit: "maxProducts",
      label: "Produkte",
      fields: (b) => ({
        name: str(b.name, 200),
        description: str(b.description, 500),
        unit: str(b.unit, 20) || "Stk.",
        price_cents: Math.round((Number(b.price) || 0) * 100),
        tax_rate: TAX_RATES.includes(Number(b.tax_rate)) ? Number(b.tax_rate) : 19,
      }),
      order: "name COLLATE NOCASE",
    },
  };

  for (const [table, cfg] of Object.entries(catalogs)) {
    router.get(`/${table}`, (req, res) => {
      res.json(db.prepare(`SELECT * FROM ${table} WHERE user_id = ? ORDER BY ${cfg.order}`).all(req.user.id));
    });

    router.post(`/${table}`, (req, res) => {
      const max = limitsFor(req.user)[cfg.limit];
      const n = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).get(req.user.id).n;
      if (n >= max) throw new HttpError(402, `Im Starter-Plan kannst du bis zu ${max} ${cfg.label} speichern. Mit Pro unbegrenzt.`);
      const f = cfg.fields(req.body);
      if (!f.name) throw new HttpError(400, "Bitte gib einen Namen ein.");
      const keys = Object.keys(f);
      const { lastInsertRowid } = db.prepare(`INSERT INTO ${table} (user_id, ${keys.join(", ")}) VALUES (?, ${keys.map(() => "?").join(", ")})`)
        .run(req.user.id, ...Object.values(f));
      res.json(own(table, lastInsertRowid, req.user.id));
    });

    router.put(`/${table}/:id`, (req, res) => {
      if (!own(table, req.params.id, req.user.id)) throw new HttpError(404, "Nicht gefunden.");
      const f = cfg.fields(req.body);
      if (!f.name) throw new HttpError(400, "Bitte gib einen Namen ein.");
      db.prepare(`UPDATE ${table} SET ${Object.keys(f).map((k) => `${k} = ?`).join(", ")} WHERE id = ? AND user_id = ?`)
        .run(...Object.values(f), Number(req.params.id), req.user.id);
      res.json(own(table, req.params.id, req.user.id));
    });

    router.delete(`/${table}/:id`, (req, res) => {
      db.prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`).run(Number(req.params.id), req.user.id);
      res.json({ ok: true });
    });
  }

  // ---------- Belege (Rechnungen & Angebote) ----------

  function displayStatus(d) {
    if (d.type === "invoice" && d.status === "open" && d.due_date && d.due_date < today()) return "overdue";
    if (d.type === "quote" && d.status === "open" && d.due_date && d.due_date < today()) return "expired";
    return d.status;
  }

  function fullDoc(row) {
    return { ...row, items: JSON.parse(row.items), small_business: Boolean(row.small_business), display_status: displayStatus(row) };
  }

  function readDocInput(body, settings) {
    const items = (Array.isArray(body.items) ? body.items : [])
      .map((i) => ({
        description: str(i.description, 300),
        details: str(i.details, 1000),
        quantity: Math.round((Number(i.quantity) || 0) * 1000) / 1000,
        unit: str(i.unit, 20),
        price: Math.round((Number(i.price) || 0) * 100) / 100,
        taxRate: TAX_RATES.includes(Number(i.taxRate)) ? Number(i.taxRate) : settings.defaultTaxRate,
      }))
      .filter((i) => i.description)
      .slice(0, 200);
    if (!items.length) throw new HttpError(400, "Bitte füge mindestens eine Position hinzu.");
    const customerName = str(body.customer_name, 160);
    if (!customerName) throw new HttpError(400, "Bitte wähle einen Kunden oder gib einen Namen ein.");
    const smallBusiness = "small_business" in body ? Boolean(body.small_business) : settings.smallBusiness;
    const discountPct = Math.min(Math.max(Number(body.discount_pct) || 0, 0), 100);
    const t = calc.totals(items, { discountPct, smallBusiness });
    return {
      customer_name: customerName,
      customer_address: str(body.customer_address, 300),
      customer_email: str(body.customer_email, 160),
      date: isoDate(body.date) || today(),
      service_date: isoDate(body.service_date),
      due_date: isoDate(body.due_date),
      items: JSON.stringify(items),
      discount_pct: discountPct,
      intro: str(body.intro, 2000),
      notes: str(body.notes, 2000),
      small_business: smallBusiness ? 1 : 0,
      net_cents: Math.round(t.net * 100),
      tax_cents: Math.round(t.tax * 100),
      total_cents: Math.round(t.total * 100),
    };
  }

  function customerIdFor(body, userId) {
    const id = Number(body.customer_id);
    return id && own("customers", id, userId) ? id : null;
  }

  // Legt einen Beleg an und vergibt bei Bedarf die nächste fortlaufende Nummer.
  function insertDocument(user, type, fields, { number, customerId = null, sourceId = null } = {}) {
    return db.transaction(() => {
      const fresh = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
      const settings = readSettings(fresh);
      const counterKey = type === "invoice" ? "nextInvoice" : "nextQuote";
      const prefix = type === "invoice" ? settings.invoicePrefix : settings.quotePrefix;
      let finalNumber = str(number, 40);
      if (!finalNumber) {
        do {
          finalNumber = formatNumber(prefix, settings[counterKey]++);
        } while (db.prepare("SELECT 1 FROM documents WHERE user_id = ? AND type = ? AND number = ?").get(user.id, type, finalNumber));
        db.prepare("UPDATE users SET settings = ? WHERE id = ?").run(JSON.stringify(settings), user.id);
      } else if (db.prepare("SELECT 1 FROM documents WHERE user_id = ? AND type = ? AND number = ?").get(user.id, type, finalNumber)) {
        throw new HttpError(409, `Die Nummer ${finalNumber} ist bereits vergeben.`);
      }
      const row = { user_id: user.id, type, number: finalNumber, status: "open", customer_id: customerId, source_id: sourceId, ...fields };
      const keys = Object.keys(row);
      const { lastInsertRowid } = db.prepare(`INSERT INTO documents (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`).run(...Object.values(row));
      return fullDoc(own("documents", lastInsertRowid, user.id));
    });
  }

  router.get("/documents/next-number", (req, res) => {
    const s = readSettings(req.user);
    const type = req.query.type === "quote" ? "quote" : "invoice";
    res.json({ number: formatNumber(type === "invoice" ? s.invoicePrefix : s.quotePrefix, type === "invoice" ? s.nextInvoice : s.nextQuote) });
  });

  router.get("/documents", (req, res) => {
    const type = req.query.type === "quote" ? "quote" : "invoice";
    const rows = db.prepare(
      `SELECT id, type, number, status, customer_id, customer_name, date, due_date, total_cents, paid_at, source_id
       FROM documents WHERE user_id = ? AND type = ? ORDER BY date DESC, id DESC`
    ).all(req.user.id, type);
    res.json(rows.map((r) => ({ ...r, total: r.total_cents / 100, display_status: displayStatus(r) })));
  });

  router.get("/documents/:id", (req, res) => {
    const row = own("documents", req.params.id, req.user.id);
    if (!row) throw new HttpError(404, "Beleg nicht gefunden.");
    res.json(fullDoc(row));
  });

  router.post("/documents", (req, res) => {
    const type = req.body.type === "quote" ? "quote" : "invoice";
    assertDocQuota(req.user);
    const settings = readSettings(req.user);
    const fields = readDocInput(req.body, settings);
    if (!fields.due_date) fields.due_date = addDays(fields.date, type === "invoice" ? settings.paymentDays : settings.quoteValidDays);
    res.json(insertDocument(req.user, type, fields, { number: req.body.number, customerId: customerIdFor(req.body, req.user.id) }));
  });

  router.put("/documents/:id", (req, res) => {
    const row = own("documents", req.params.id, req.user.id);
    if (!row) throw new HttpError(404, "Beleg nicht gefunden.");
    const fields = readDocInput(req.body, readSettings(req.user));
    const number = str(req.body.number, 40) || row.number;
    if (number !== row.number && db.prepare("SELECT 1 FROM documents WHERE user_id = ? AND type = ? AND number = ?").get(req.user.id, row.type, number)) {
      throw new HttpError(409, `Die Nummer ${number} ist bereits vergeben.`);
    }
    const all = { ...fields, number, customer_id: customerIdFor(req.body, req.user.id) };
    db.prepare(`UPDATE documents SET ${Object.keys(all).map((k) => `${k} = ?`).join(", ")} WHERE id = ?`).run(...Object.values(all), row.id);
    res.json(fullDoc(own("documents", row.id, req.user.id)));
  });

  router.patch("/documents/:id/status", (req, res) => {
    const row = own("documents", req.params.id, req.user.id);
    if (!row) throw new HttpError(404, "Beleg nicht gefunden.");
    const status = String(req.body.status);
    if (!STATUSES[row.type].includes(status)) throw new HttpError(400, "Ungültiger Status.");
    db.prepare("UPDATE documents SET status = ?, paid_at = ? WHERE id = ?").run(status, status === "paid" ? today() : null, row.id);
    res.json(fullDoc(own("documents", row.id, req.user.id)));
  });

  // Angebot -> Rechnung, oder Beleg duplizieren
  const copyDocument = (convert) => (req, res) => {
    const row = own("documents", req.params.id, req.user.id);
    if (!row) throw new HttpError(404, "Beleg nicht gefunden.");
    if (convert && row.type !== "quote") throw new HttpError(400, "Nur Angebote können in Rechnungen umgewandelt werden.");
    assertDocQuota(req.user);
    const settings = readSettings(req.user);
    const type = convert ? "invoice" : row.type;
    const date = today();
    const fields = {
      customer_name: row.customer_name,
      customer_address: row.customer_address,
      customer_email: row.customer_email,
      date,
      service_date: "",
      due_date: addDays(date, type === "invoice" ? settings.paymentDays : settings.quoteValidDays),
      items: row.items,
      discount_pct: row.discount_pct,
      intro: convert ? settings.invoiceIntro : row.intro,
      notes: convert ? settings.invoiceNotes : row.notes,
      small_business: row.small_business,
      net_cents: row.net_cents,
      tax_cents: row.tax_cents,
      total_cents: row.total_cents,
    };
    const created = insertDocument(req.user, type, fields, { customerId: row.customer_id, sourceId: convert ? row.id : null });
    if (convert) db.prepare("UPDATE documents SET status = 'accepted' WHERE id = ?").run(row.id);
    res.json(created);
  };
  router.post("/documents/:id/convert", copyDocument(true));
  router.post("/documents/:id/duplicate", copyDocument(false));

  router.delete("/documents/:id", (req, res) => {
    db.prepare("DELETE FROM documents WHERE id = ? AND user_id = ?").run(Number(req.params.id), req.user.id);
    res.json({ ok: true });
  });

  router.get("/documents/:id/pdf", async (req, res) => {
    const row = own("documents", req.params.id, req.user.id);
    if (!row) throw new HttpError(404, "Beleg nicht gefunden.");
    const limits = limitsFor(req.user);
    const kind = req.query.kind === "reminder" ? "reminder" : "document";
    if (kind === "reminder" && !limits.reminders) throw new HttpError(403, "Zahlungserinnerungen sind eine Pro-Funktion.");
    if (kind === "reminder" && row.type !== "invoice") throw new HttpError(400, "Erinnerungen gibt es nur für Rechnungen.");
    const pdf = await renderPdf(fullDoc(row), readSettings(req.user), { kind, limits, appName });
    const name = `${kind === "reminder" ? "Zahlungserinnerung" : row.type === "invoice" ? "Rechnung" : "Angebot"}_${row.number}.pdf`.replace(/[^\w.\-]/g, "_");
    res.type("application/pdf")
      .set("Content-Disposition", `${req.query.download ? "attachment" : "inline"}; filename="${name}"`)
      .send(pdf);
  });

  // ---------- Auswertung ----------

  router.get("/stats", (req, res) => {
    const id = req.user.id;
    const months = db.prepare(
      `SELECT substr(date, 1, 7) AS month, SUM(total_cents) AS total FROM documents
       WHERE user_id = ? AND type = 'invoice' AND status != 'cancelled' AND date >= date('now', 'start of month', '-5 months')
       GROUP BY month`
    ).all(id);
    const series = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      series.push({ month: key, total: (months.find((m) => m.month === key)?.total || 0) / 100 });
    }
    const sum = (where, ...args) => (db.prepare(`SELECT COALESCE(SUM(total_cents), 0) AS s, COUNT(*) AS n FROM documents WHERE user_id = ? AND ${where}`).get(id, ...args));
    const open = sum("type = 'invoice' AND status = 'open'");
    const overdue = sum("type = 'invoice' AND status = 'open' AND due_date != '' AND due_date < ?", today());
    const paidMonth = sum("type = 'invoice' AND status = 'paid' AND paid_at >= date('now', 'start of month')");
    const quotes = sum("type = 'quote' AND status = 'open'");
    const recent = db.prepare(
      `SELECT id, type, number, status, customer_name, date, due_date, total_cents FROM documents
       WHERE user_id = ? ORDER BY id DESC LIMIT 6`
    ).all(id).map((r) => ({ ...r, total: r.total_cents / 100, display_status: displayStatus(r) }));
    res.json({
      series,
      invoicedThisMonth: series.at(-1).total,
      paidThisMonth: paidMonth.s / 100,
      open: { total: open.s / 100, count: open.n },
      overdue: { total: overdue.s / 100, count: overdue.n },
      openQuotes: { total: quotes.s / 100, count: quotes.n },
      recent,
    });
  });

  router.get("/export.csv", (req, res) => {
    if (!limitsFor(req.user).csvExport) throw new HttpError(403, "Der CSV-Export ist eine Pro-Funktion.");
    const rows = db.prepare("SELECT * FROM documents WHERE user_id = ? AND type = 'invoice' ORDER BY date, number").all(req.user.id);
    const money = (c) => (c / 100).toFixed(2).replace(".", ",");
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const labels = { open: "offen", paid: "bezahlt", cancelled: "storniert" };
    const lines = [["Rechnungsnr.", "Datum", "Kunde", "Netto", "USt.", "Brutto", "Status", "Bezahlt am"].map(cell).join(";")];
    for (const r of rows) {
      lines.push([r.number, r.date, r.customer_name, money(r.net_cents), money(r.tax_cents), money(r.total_cents), labels[r.status], r.paid_at || ""].map(cell).join(";"));
    }
    res.type("text/csv").attachment("rechnungen.csv").send("﻿" + lines.join("\r\n"));
  });

  return router;
};

module.exports.HttpError = HttpError;
