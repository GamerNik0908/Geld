// Erzeugt Rechnungen, Angebote und Zahlungserinnerungen als PDF (A4, angelehnt an DIN 5008).
const PDFDocument = require("pdfkit");
const calc = require("./calc");
const { girocodePng, isValidIban } = require("./girocode");

const mm = (v) => v * 2.8346;
const PAGE = { w: 595.28, h: 841.89 };
const LEFT = mm(25);
const RIGHT = PAGE.w - mm(20);
const WIDTH = RIGHT - LEFT;
const FOOTER_TOP = PAGE.h - mm(28);
const INK = "#111827";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";

const eur = (n) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const qty = (n) => n.toLocaleString("de-DE", { maximumFractionDigits: 3 });
const date = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("de-DE") : "");
const addDays = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

function dataUrlToBuffer(url) {
  const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(url || "");
  return m ? Buffer.from(m[2], "base64") : null;
}

/**
 * @param doc      Datensatz aus der Tabelle documents (items als Array)
 * @param company  Firmendaten (lib/settings.js)
 * @param options  { kind: 'document' | 'reminder', limits, appName }
 */
async function renderPdf(doc, company, { kind = "document", limits, appName }) {
  const brand = limits.branding ? company.brandColor : "#4f46e5";
  const logo = limits.branding ? dataUrlToBuffer(company.logo) : null;
  const reminder = kind === "reminder";
  const isInvoice = doc.type === "invoice";
  const title = reminder ? "Zahlungserinnerung" : isInvoice ? "Rechnung" : "Angebot";
  const t = calc.totals(doc.items, { discountPct: doc.discount_pct, smallBusiness: doc.small_business });

  const pdf = new PDFDocument({
    size: "A4",
    margins: { top: mm(20), bottom: 0, left: LEFT, right: PAGE.w - RIGHT },
    bufferPages: true,
    info: { Title: `${title} ${doc.number}`, Author: company.name || "", Creator: appName },
  });
  const chunks = [];
  pdf.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve) => pdf.on("end", () => resolve(Buffer.concat(chunks))));

  // ---------- Kopf ----------
  if (logo) {
    try {
      pdf.image(logo, RIGHT - 160, mm(15), { fit: [160, 55], align: "right" });
    } catch {
      /* ungültiges Bild: ohne Logo weiter */
    }
  }
  pdf.rect(LEFT, mm(14), 28, 3).fill(brand);
  pdf.font("Helvetica-Bold").fontSize(15).fillColor(INK).text(company.name || "Dein Firmenname", LEFT, mm(20), { width: WIDTH - 180 });

  // Absenderzeile über dem Adressfeld (für Fensterumschläge)
  const sender = [company.name, ...company.address.split("\n")].filter(Boolean).join(" · ");
  pdf.font("Helvetica").fontSize(7).fillColor(MUTED).text(sender, LEFT, mm(47), { width: mm(85), lineBreak: false, ellipsis: true });
  pdf.moveTo(LEFT, mm(50.5)).lineTo(LEFT + mm(85), mm(50.5)).lineWidth(0.4).strokeColor(LINE).stroke();

  // Empfänger
  pdf.font("Helvetica").fontSize(10).fillColor(INK)
    .text([doc.customer_name, doc.customer_address].filter(Boolean).join("\n"), LEFT, mm(54), { width: mm(85), height: mm(36) });

  // Infoblock rechts
  const info = reminder
    ? [["Rechnungsnr.", doc.number], ["Rechnungsdatum", date(doc.date)], ["Fällig seit", date(doc.due_date)], ["Datum", date(addDays(0))]]
    : [
        [isInvoice ? "Rechnungsnr." : "Angebotsnr.", doc.number],
        [isInvoice ? "Rechnungsdatum" : "Angebotsdatum", date(doc.date)],
        doc.service_date && ["Leistungsdatum", date(doc.service_date)],
        doc.due_date && [isInvoice ? "Zahlbar bis" : "Gültig bis", date(doc.due_date)],
      ].filter(Boolean);
  let iy = mm(54);
  const ix = LEFT + mm(110);
  for (const [label, value] of info) {
    pdf.font("Helvetica").fontSize(9).fillColor(MUTED).text(label, ix, iy, { width: 80 });
    pdf.font("Helvetica-Bold").fillColor(INK).text(value, ix + 80, iy, { width: RIGHT - ix - 80, align: "right" });
    iy += 15;
  }

  // ---------- Titel & Einleitung ----------
  let y = mm(100);
  pdf.font("Helvetica-Bold").fontSize(18).fillColor(INK).text(`${title}${reminder ? "" : " " + doc.number}`, LEFT, y);
  y = pdf.y + 10;

  const intro = reminder
    ? `sicherlich ist es Ihrer Aufmerksamkeit entgangen, dass die Rechnung ${doc.number} vom ${date(doc.date)} über ${eur(t.total)} noch offen ist. Sollte sich Ihre Zahlung mit diesem Schreiben überschnitten haben, betrachten Sie es bitte als gegenstandslos.`
    : doc.intro;
  if (intro) {
    pdf.font("Helvetica").fontSize(10).fillColor(INK).text(reminder ? `Sehr geehrte Damen und Herren,\n\n${intro}` : intro, LEFT, y, { width: WIDTH, lineGap: 2 });
    y = pdf.y + 18;
  }

  // ---------- Positionen ----------
  const showTax = !doc.small_business;
  const cols = [
    { key: "pos", label: "Pos.", w: 38 },
    { key: "desc", label: "Beschreibung", w: 0 },
    { key: "qty", label: "Menge", w: 62, align: "right" },
    { key: "price", label: "Einzelpreis", w: 72, align: "right" },
    ...(showTax ? [{ key: "tax", label: "USt.", w: 36, align: "right" }] : []),
    { key: "total", label: "Gesamt", w: 76, align: "right" },
  ];
  cols[1].w = WIDTH - cols.reduce((s, c) => s + c.w, 0);
  let x = LEFT;
  for (const c of cols) { c.x = x; x += c.w; }

  const ensureSpace = (needed) => {
    if (y + needed < FOOTER_TOP - 20) return false;
    pdf.addPage();
    y = mm(25);
    return true;
  };
  const tableHeader = () => {
    pdf.rect(LEFT, y, WIDTH, 22).fill("#f3f4f6");
    pdf.font("Helvetica-Bold").fontSize(8.5).fillColor(MUTED);
    for (const c of cols) pdf.text(c.label.toUpperCase(), c.x + 6, y + 7, { width: c.w - 12, align: c.align || "left", characterSpacing: 0.3 });
    y += 28;
  };

  if (!reminder) {
    tableHeader();
    doc.items.forEach((item, i) => {
      pdf.font("Helvetica").fontSize(9.5);
      const descH = pdf.heightOfString(item.description, { width: cols[1].w - 12 });
      pdf.fontSize(8.5);
      const detailH = item.details ? pdf.heightOfString(item.details, { width: cols[1].w - 12 }) + 2 : 0;
      const rowH = Math.max(descH + detailH, 12) + 12;
      if (ensureSpace(rowH)) tableHeader();
      const cells = {
        pos: String(i + 1),
        qty: `${qty(item.quantity)} ${item.unit || ""}`.trim(),
        price: eur(Number(item.price) || 0),
        tax: `${item.taxRate || 0} %`,
        total: eur(calc.lineTotal(item)),
      };
      pdf.fillColor(INK).font("Helvetica").fontSize(9.5);
      for (const c of cols) {
        if (c.key === "desc") {
          pdf.font("Helvetica-Bold").text(item.description, c.x + 6, y, { width: c.w - 12 });
          if (item.details) pdf.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(item.details, c.x + 6, y + descH + 2, { width: c.w - 12 });
          pdf.font("Helvetica").fontSize(9.5).fillColor(INK);
        } else {
          pdf.text(cells[c.key], c.x + 6, y, { width: c.w - 12, align: c.align || "left" });
        }
      }
      y += rowH - 6;
      pdf.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(0.5).strokeColor(LINE).stroke();
      y += 8;
    });
  }

  // ---------- Summen ----------
  const rows = reminder
    ? [["Offener Betrag", eur(t.total)]]
    : [
        ...(t.discount ? [["Zwischensumme", eur(t.subtotal)], [`Rabatt (${qty(doc.discount_pct)} %)`, "- " + eur(t.discount)]] : []),
        ...(showTax ? [["Nettobetrag", eur(t.net)], ...t.taxes.map((x) => [`zzgl. ${x.rate} % USt. auf ${eur(x.net)}`, eur(x.tax)])] : []),
      ];
  ensureSpace(rows.length * 16 + 50);
  const sx = RIGHT - 250;
  pdf.font("Helvetica").fontSize(9.5);
  for (const [label, value] of rows) {
    pdf.fillColor(MUTED).text(label, sx, y, { width: 160 });
    pdf.fillColor(INK).text(value, sx + 160, y, { width: 90, align: "right" });
    y += 16;
  }
  y += 4;
  pdf.rect(sx - 8, y - 4, 258, 26).fill(brand);
  pdf.font("Helvetica-Bold").fontSize(11).fillColor("#ffffff")
    .text(reminder ? "Zu zahlen" : "Gesamtbetrag", sx, y + 3, { width: 150 })
    .text(eur(t.total), sx + 150, y + 3, { width: 92, align: "right" });
  y += 40;

  // ---------- Hinweise, Zahlung, QR ----------
  const paragraphs = [];
  if (doc.small_business) paragraphs.push("Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.");
  if (isInvoice || reminder) {
    const due = reminder ? date(addDays(7)) : date(doc.due_date);
    paragraphs.push(
      `Bitte überweisen Sie den Betrag von ${eur(t.total)}${due ? ` bis zum ${due}` : ""} unter Angabe der Rechnungsnummer ${doc.number}` +
        (company.iban ? ` auf folgendes Konto:\nIBAN ${company.iban}${company.bic ? " · BIC " + company.bic : ""}${company.bank ? " · " + company.bank : ""}` : ".")
    );
  }
  if (!reminder && doc.notes) paragraphs.push(doc.notes);
  if (reminder) paragraphs.push("Mit freundlichen Grüßen\n" + (company.name || ""));

  const qr = limits.qrCode && (isInvoice || reminder) && isValidIban(company.iban) && t.total > 0
    ? await girocodePng({ name: company.name || "Empfänger", iban: company.iban, bic: company.bic, amount: t.total, reference: `Rechnung ${doc.number}` })
    : null;
  const textWidth = qr ? WIDTH - 110 : WIDTH;
  pdf.font("Helvetica").fontSize(9.5);
  const textHeight = paragraphs.reduce((h, p) => h + pdf.heightOfString(p, { width: textWidth, lineGap: 2 }) + 8, 0);
  ensureSpace(Math.max(textHeight, qr ? 110 : 0));
  const blockTop = y;
  for (const p of paragraphs) {
    pdf.fillColor(INK).text(p, LEFT, y, { width: textWidth, lineGap: 2 });
    y = pdf.y + 8;
  }
  if (qr) {
    pdf.image(qr, RIGHT - 90, blockTop, { width: 90 });
    pdf.font("Helvetica").fontSize(7).fillColor(MUTED).text("Mit Banking-App scannen", RIGHT - 100, blockTop + 92, { width: 110, align: "center" });
  }

  // ---------- Fußzeile auf jeder Seite ----------
  const range = pdf.bufferedPageRange();
  const footerCols = [
    [company.name, ...company.address.split("\n")],
    [company.email, company.phone, company.website],
    [company.bank, company.iban && `IBAN ${company.iban}`, company.bic && `BIC ${company.bic}`],
    [company.taxNumber && `St.-Nr. ${company.taxNumber}`, company.vatId && `USt-IdNr. ${company.vatId}`],
  ].map((c) => c.filter(Boolean)).filter((c) => c.length);
  for (let i = 0; i < range.count; i++) {
    pdf.switchToPage(i);
    pdf.moveTo(LEFT, FOOTER_TOP).lineTo(RIGHT, FOOTER_TOP).lineWidth(0.5).strokeColor(LINE).stroke();
    // Breiten nach längster Zeile gewichten, damit z. B. die IBAN nicht umbricht
    pdf.font("Helvetica").fontSize(7);
    const weights = footerCols.map((lines) => Math.max(...lines.map((l) => pdf.widthOfString(l))) + 10);
    const scale = Math.min(1, WIDTH / weights.reduce((a, b) => a + b, 0));
    const gap = (WIDTH - weights.reduce((a, b) => a + b * scale, 0)) / Math.max(footerCols.length - 1, 1);
    let fx = LEFT;
    footerCols.forEach((lines, n) => {
      pdf.fillColor(MUTED).text(lines.join("\n"), fx, FOOTER_TOP + 8, { width: weights[n] * scale, lineGap: 1, height: mm(16) });
      fx += weights[n] * scale + gap;
    });
    if (range.count > 1) {
      pdf.fontSize(7).text(`Seite ${i + 1} von ${range.count}`, LEFT, PAGE.h - mm(9), { width: WIDTH, align: "right", lineBreak: false });
    }
    if (limits.watermark) {
      pdf.fontSize(7).fillColor("#9ca3af").text(`Erstellt mit ${appName} – kostenlos Rechnungen schreiben`, LEFT, PAGE.h - mm(9), { width: WIDTH, align: "center", lineBreak: false });
    }
  }

  pdf.end();
  return done;
}

module.exports = { renderPdf };
