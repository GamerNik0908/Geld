// Firmendaten und Voreinstellungen eines Kontos (gespeichert als JSON in users.settings).
const DEFAULTS = {
  name: "",
  address: "",
  email: "",
  phone: "",
  website: "",
  iban: "",
  bic: "",
  bank: "",
  taxNumber: "",
  vatId: "",
  smallBusiness: true,
  logo: "",
  brandColor: "#4f46e5",
  invoicePrefix: "RE-{JAHR}-",
  quotePrefix: "AN-{JAHR}-",
  nextInvoice: 1,
  nextQuote: 1,
  paymentDays: 14,
  quoteValidDays: 30,
  defaultTaxRate: 19,
  invoiceIntro: "Vielen Dank für Ihren Auftrag. Ich stelle Ihnen folgende Leistungen in Rechnung:",
  invoiceNotes: "Ich freue mich auf die weitere Zusammenarbeit.",
  quoteIntro: "Vielen Dank für Ihre Anfrage. Gerne biete ich Ihnen folgende Leistungen an:",
  quoteNotes: "Ich freue mich auf Ihre Rückmeldung.",
};

const TEXT_LIMITS = {
  name: 120, address: 300, email: 120, phone: 60, website: 120, iban: 42, bic: 11, bank: 80,
  taxNumber: 40, vatId: 20, invoicePrefix: 30, quotePrefix: 30,
  invoiceIntro: 1000, invoiceNotes: 1000, quoteIntro: 1000, quoteNotes: 1000,
};

function readSettings(user) {
  return { ...DEFAULTS, ...JSON.parse(user.settings || "{}") };
}

// Übernimmt nur bekannte Felder aus einer Nutzereingabe.
function sanitizeSettings(input, current) {
  const next = { ...current };
  for (const [key, max] of Object.entries(TEXT_LIMITS)) {
    if (key in input) next[key] = String(input[key] ?? "").slice(0, max);
  }
  if ("smallBusiness" in input) next.smallBusiness = Boolean(input.smallBusiness);
  if ("brandColor" in input && /^#[0-9a-f]{6}$/i.test(input.brandColor)) next.brandColor = input.brandColor;
  for (const key of ["nextInvoice", "nextQuote"]) {
    if (key in input) next[key] = Math.max(1, Math.min(999999, parseInt(input[key], 10) || 1));
  }
  if ("paymentDays" in input) next.paymentDays = Math.max(0, Math.min(365, parseInt(input.paymentDays, 10) || 0));
  if ("quoteValidDays" in input) next.quoteValidDays = Math.max(0, Math.min(365, parseInt(input.quoteValidDays, 10) || 0));
  if ("defaultTaxRate" in input && [0, 7, 19].includes(Number(input.defaultTaxRate))) next.defaultTaxRate = Number(input.defaultTaxRate);
  return next;
}

function formatNumber(prefix, counter, date = new Date()) {
  const year = String(date.getFullYear());
  return prefix.replace(/\{JAHR\}/g, year).replace(/\{MONAT\}/g, String(date.getMonth() + 1).padStart(2, "0")) +
    String(counter).padStart(4, "0");
}

module.exports = { DEFAULTS, readSettings, sanitizeSettings, formatNumber };
