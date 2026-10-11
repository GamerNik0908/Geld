// EPC-QR-Code ("GiroCode"): Banking-Apps lesen daraus Empfänger, IBAN, Betrag und Verwendungszweck.
const QRCode = require("qrcode");

function epcPayload({ name, iban, bic = "", amount, reference }) {
  return [
    "BCD", "002", "1", "SCT",
    bic.replace(/\s/g, ""),
    name.slice(0, 70),
    iban.replace(/\s/g, "").toUpperCase(),
    `EUR${amount.toFixed(2)}`,
    "", "",
    reference.slice(0, 140),
  ].join("\n");
}

function isValidIban(iban) {
  const s = String(iban || "").replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const moved = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => c.charCodeAt(0) - 55);
  let rest = 0;
  for (const digit of moved) rest = (rest * 10 + Number(digit)) % 97;
  return rest === 1;
}

async function girocodePng(data) {
  return QRCode.toBuffer(epcPayload(data), { errorCorrectionLevel: "M", margin: 1, width: 300 });
}

module.exports = { epcPayload, girocodePng, isValidIban };
