const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rb-")), "test.db");
delete process.env.STRIPE_SECRET_KEY;
const app = require("../server");

let server, base, cookie = "";
before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://localhost:${server.address().port}/api`; r(); }); }));
after(() => server.close());

async function call(p, method = "GET", body) {
  const res = await fetch(base + p, {
    method, headers: { cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  return { status: res.status, body: res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text() };
}
const invoice = { customer: "Max Mustermann", items: [{ description: "Website", quantity: 2, price: 49.5 }] };

test("Gratis-Plan: Limit, Wasserzeichen, gesperrte Pro-Funktionen; Pro schaltet frei", async () => {
  assert.equal((await call("/me")).status, 401);
  assert.equal((await call("/register", "POST", { email: "a@b.de", password: "geheim123" })).status, 200);
  const me = await call("/me");
  assert.equal(me.body.plan, "free");

  for (let i = 0; i < 3; i++) assert.equal((await call("/invoices", "POST", invoice)).status, 200);
  assert.equal((await call("/invoices", "POST", invoice)).status, 402);

  const list = (await call("/invoices")).body;
  const inv = (await call("/invoices/" + list[0].id)).body;
  assert.equal(inv.total, 99);
  assert.equal(inv.watermark, true);
  assert.equal((await call("/export.csv")).status, 403);
  assert.equal((await call("/company", "PUT", { name: "X", logo: "data:image/png;base64,AAAA" })).status, 403);

  assert.equal((await call("/checkout", "POST", {})).status, 200); // Testmodus
  assert.equal((await call("/me")).body.plan, "pro");
  assert.equal((await call("/invoices", "POST", invoice)).status, 200);
  assert.equal((await call("/invoices/" + list[0].id)).body.watermark, false);
  const csv = await call("/export.csv");
  assert.equal(csv.status, 200);
  assert.match(csv.body, /Max Mustermann/);
});

test("Fremde Rechnungen sind nicht abrufbar; Nicht-JSON wird abgelehnt", async () => {
  const mine = (await call("/invoices")).body[0].id;
  cookie = "";
  await call("/register", "POST", { email: "c@d.de", password: "geheim123" });
  assert.equal((await call("/invoices/" + mine)).status, 404);
  const res = await fetch(base + "/logout", { method: "POST", headers: { cookie, "Content-Type": "application/x-www-form-urlencoded" } });
  assert.equal(res.status, 415);
});
