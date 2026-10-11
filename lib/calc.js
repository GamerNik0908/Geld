// Gemeinsame Rechenlogik für Server (PDF, Speichern) und Browser (Live-Vorschau).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.calc = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const cents = (n) => Math.round((Number(n) || 0) * 100);

  // items: [{ quantity, price, taxRate }], price = Netto-Einzelpreis in Euro.
  function totals(items, { discountPct = 0, smallBusiness = false } = {}) {
    const discount = Math.min(Math.max(Number(discountPct) || 0, 0), 100) / 100;
    let subtotal = 0;
    const byRate = new Map();
    for (const item of items) {
      const line = Math.round((Number(item.quantity) || 0) * cents(item.price));
      subtotal += line;
      const rate = smallBusiness ? 0 : Number(item.taxRate) || 0;
      byRate.set(rate, (byRate.get(rate) || 0) + line);
    }
    const discountCents = Math.round(subtotal * discount);
    let taxCents = 0;
    const taxes = [];
    for (const [rate, base] of [...byRate].sort((a, b) => b[0] - a[0])) {
      if (!rate) continue;
      const net = Math.round(base * (1 - discount));
      const tax = Math.round((net * rate) / 100);
      taxCents += tax;
      taxes.push({ rate, net: net / 100, tax: tax / 100 });
    }
    const net = subtotal - discountCents;
    return {
      subtotal: subtotal / 100,
      discount: discountCents / 100,
      net: net / 100,
      taxes,
      tax: taxCents / 100,
      total: (net + taxCents) / 100,
    };
  }

  function lineTotal(item) {
    return Math.round((Number(item.quantity) || 0) * cents(item.price)) / 100;
  }

  return { totals, lineTotal };
});
