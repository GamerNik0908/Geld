const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rb-")), "test.db");
delete process.env.STRIPE_SECRET_KEY;
const app = require("../server");
const db = require("../db");

let server, base;
before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://localhost:${server.address().port}/api`; r(); }); }));
after(() => server.close());

function client() {
  let cookie = "";
  return async function call(p, method = "GET", body) {
    const res = await fetch(base + p, {
      method,
      headers: { cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const type = res.headers.get("content-type") || "";
    const data = type.includes("json") ? await res.json() : type.includes("pdf") ? Buffer.from(await res.arrayBuffer()) : await res.text();
    return { status: res.status, body: data, type };
  };
}

async function newUser(email) {
  const call = client();
  assert.equal((await call("/register", "POST", { email, password: "geheim123" })).status, 200);
  return call;
}

const endTrial = (email) => db.prepare("UPDATE users SET trial_ends_at = 0 WHERE email = ?").run(email);
const doc = (extra = {}) => ({
  type: "invoice",
  customer_name: "Muster GmbH",
  customer_address: "Hauptstr. 1\n10115 Berlin",
  items: [
    { description: "Webdesign", quantity: 10, unit: "Std.", price: 80, taxRate: 19 },
    { description: "Fachbuch", quantity: 1, unit: "Stk.", price: 30, taxRate: 7 },
  ],
  small_business: false,
  ...extra,
});

test("Neue Konten starten mit 14 Tagen Pro, danach gilt der Starter-Plan", async () => {
  const call = await newUser("trial@test.de");
  let me = (await call("/me")).body;
  assert.equal(me.plan, "pro");
  assert.ok(me.trialEndsAt > Date.now());
  endTrial("trial@test.de");
  me = (await call("/me")).body;
  assert.equal(me.plan, "free");
  assert.equal(me.limits.docsPerMonth, 3);
});

test("Summen, Steuersätze, Rabatt und fortlaufende Nummern", async () => {
  const call = await newUser("calc@test.de");
  const a = (await call("/documents", "POST", doc({ discount_pct: 10 }))).body;
  // 800 + 30 = 830, -10 % = 747 netto; USt: 720*19% = 136,80 + 27*7% = 1,89
  assert.equal(a.net_cents, 74700);
  assert.equal(a.tax_cents, 13869);
  assert.equal(a.total_cents, 88569);
  assert.match(a.number, /^RE-\d{4}-0001$/);
  const b = (await call("/documents", "POST", doc())).body;
  assert.match(b.number, /^RE-\d{4}-0002$/);
  assert.equal((await call("/documents", "POST", doc({ number: b.number }))).status, 409);
  const small = (await call("/documents", "POST", doc({ small_business: true }))).body;
  assert.equal(small.tax_cents, 0);
  assert.equal(small.total_cents, 83000);
  assert.ok(small.due_date > small.date);
});

test("Angebot wird zur Rechnung, Status und PDF", async () => {
  const call = await newUser("flow@test.de");
  const quote = (await call("/documents", "POST", doc({ type: "quote" }))).body;
  assert.match(quote.number, /^AN-/);
  const inv = (await call(`/documents/${quote.id}/convert`, "POST", {})).body;
  assert.equal(inv.type, "invoice");
  assert.equal(inv.total_cents, quote.total_cents);
  assert.equal((await call(`/documents/${quote.id}`)).body.status, "accepted");

  const pdf = await call(`/documents/${inv.id}/pdf`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.body.subarray(0, 4).toString(), "%PDF");
  assert.equal((await call(`/documents/${inv.id}/pdf?kind=reminder`)).status, 200);

  const paid = (await call(`/documents/${inv.id}/status`, "PATCH", { status: "paid" })).body;
  assert.equal(paid.status, "paid");
  assert.ok(paid.paid_at);
  const stats = (await call("/stats")).body;
  assert.equal(stats.paidThisMonth, inv.total_cents / 100);
});

test("Starter-Plan: Limits und gesperrte Pro-Funktionen, Upgrade schaltet frei", async () => {
  const call = await newUser("free@test.de");
  endTrial("free@test.de");
  for (let i = 0; i < 3; i++) assert.equal((await call("/documents", "POST", doc())).status, 200);
  assert.equal((await call("/documents", "POST", doc())).status, 402);
  for (let i = 0; i < 5; i++) assert.equal((await call("/products", "POST", { name: "P" + i, price: 10 })).status, 200);
  assert.equal((await call("/products", "POST", { name: "P6", price: 10 })).status, 402);
  const id = (await call("/documents?type=invoice")).body[0].id;
  assert.equal((await call(`/documents/${id}/pdf?kind=reminder`)).status, 403);
  assert.equal((await call("/export.csv")).status, 403);
  assert.equal((await call("/settings", "PUT", { logo: "data:image/png;base64,AAAA" })).status, 403);

  assert.equal((await call("/checkout", "POST", { interval: "month" })).status, 200);
  assert.equal((await call("/me")).body.plan, "pro");
  assert.equal((await call("/documents", "POST", doc())).status, 200);
  const csv = await call("/export.csv");
  assert.equal(csv.status, 200);
  assert.match(csv.body, /Muster GmbH/);
});

test("Daten anderer Konten sind nicht erreichbar", async () => {
  const alice = await newUser("alice@test.de");
  const bob = await newUser("bob@test.de");
  const d = (await alice("/documents", "POST", doc())).body;
  const c = (await alice("/customers", "POST", { name: "Geheim AG" })).body;
  assert.equal((await bob(`/documents/${d.id}`)).status, 404);
  assert.equal((await bob(`/documents/${d.id}/pdf`)).status, 404);
  assert.equal((await bob(`/customers/${c.id}`, "PUT", { name: "x" })).status, 404);
  await bob(`/documents/${d.id}`, "DELETE");
  assert.equal((await alice(`/documents/${d.id}`)).status, 200);
  assert.equal((await bob("/customers")).body.length, 0);
});

test("Sicherheit: falsches Passwort, Nicht-JSON, Konto löschen", async () => {
  const call = client();
  assert.equal((await call("/login", "POST", { email: "alice@test.de", password: "falsch!!" })).status, 401);
  const res = await fetch(base + "/logout", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  assert.equal(res.status, 415);

  const del = await newUser("delete@test.de");
  await del("/customers", "POST", { name: "Kunde" });
  assert.equal((await del("/account", "DELETE", { password: "falsch" })).status, 400);
  assert.equal((await del("/account", "DELETE", { password: "geheim123" })).status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'delete@test.de'").get().n, 0);
});
