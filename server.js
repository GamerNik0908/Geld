const path = require("node:path");
const express = require("express");
const { purgeExpiredSessions } = require("./lib/auth");
const accountRoutes = require("./routes/account");
const dataRoutes = require("./routes/data");
const billingRoutes = require("./routes/billing");

const PORT = process.env.PORT || 3000;
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const APP_NAME = process.env.APP_NAME || "Rechnungsblitz";
const stripe = process.env.STRIPE_SECRET_KEY ? require("stripe")(process.env.STRIPE_SECRET_KEY) : null;

const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);

app.use((req, res, next) => {
  res.set({
    "Content-Security-Policy": [
      "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
      "font-src 'self'", "connect-src 'self'", "frame-src 'self'", "object-src 'none'", "base-uri 'self'",
      "form-action 'self'", "frame-ancestors 'self'",
    ].join("; "),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    ...(BASE_URL.startsWith("https") ? { "Strict-Transport-Security": "max-age=31536000" } : {}),
  });
  next();
});

const billing = billingRoutes({ stripe, baseUrl: BASE_URL });
app.post("/api/stripe/webhook", ...billing.webhook);

app.use(express.json({ limit: "1mb" }));
// Nur JSON-Requests: Browser können Cross-Site kein JSON ohne CORS senden (CSRF-Schutz zusammen mit SameSite-Cookies).
app.use("/api", (req, res, next) => {
  if (!["GET", "HEAD"].includes(req.method) && !req.is("application/json")) {
    return res.status(415).json({ error: "Content-Type muss application/json sein." });
  }
  next();
});

app.use("/api", accountRoutes({ secureCookies: BASE_URL.startsWith("https"), billingEnabled: Boolean(stripe) }));
app.use("/api", billing);
app.use("/api", dataRoutes({ appName: APP_NAME }));
app.use("/api", (req, res) => res.status(404).json({ error: "Nicht gefunden." }));

app.use("/fonts", express.static(path.join(__dirname, "node_modules/@fontsource-variable/inter/files"), { maxAge: "365d", immutable: true }));
app.get("/lib/calc.js", (req, res) => res.sendFile(path.join(__dirname, "lib/calc.js")));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, "public/404.html")));

app.use((err, req, res, next) => {
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Da ist etwas schiefgelaufen. Bitte versuche es erneut." });
});

if (require.main === module) {
  purgeExpiredSessions();
  setInterval(purgeExpiredSessions, 6 * 3600e3).unref();
  app.listen(PORT, () => {
    console.log(`${APP_NAME} läuft auf ${BASE_URL}`);
    if (!stripe) console.log("Testmodus: kein STRIPE_SECRET_KEY gesetzt – Upgrades sind kostenlos.");
  });
}

module.exports = app;
