import { api } from "../api.js";
import { confirmDialog, toast } from "../ui.js";

// Gemeinsame Aktionen für einen Beleg (Liste und Editor)
export function documentActions(doc, ctx, { onChange, onCreated, onDeleted }) {
  const isInvoice = doc.type === "invoice";
  const pdf = (extra = "") => `/api/documents/${doc.id}/pdf${extra}`;
  const run = async (fn, okMsg) => {
    try {
      const result = await fn();
      if (okMsg) toast(okMsg);
      return result;
    } catch (err) {
      ctx.handleError(err);
    }
  };
  const setStatus = (status, msg) => run(async () => { await api(`/documents/${doc.id}/status`, "PATCH", { status }); await onChange?.(); }, msg);

  const items = [
    { icon: "eye", label: "PDF ansehen", action: () => window.open(pdf(), "_blank") },
    { icon: "download", label: "PDF herunterladen", action: () => { location.href = pdf("?download=1"); } },
    "-",
  ];
  if (isInvoice) {
    if (doc.status !== "paid") items.push({ icon: "checkCircle", label: "Als bezahlt markieren", action: () => setStatus("paid", "Als bezahlt markiert") });
    else items.push({ icon: "clock", label: "Wieder auf offen setzen", action: () => setStatus("open", "Wieder offen") });
    if (doc.status === "open") {
      items.push({
        icon: "bell",
        label: "Zahlungserinnerung (PDF)",
        pro: !ctx.isPro(),
        action: () => (ctx.isPro() ? window.open(pdf("?kind=reminder"), "_blank") : ctx.upgradePrompt("Mit Pro erstellst du freundliche Zahlungserinnerungen mit einem Klick – inklusive GiroCode.")),
      });
    }
  } else {
    items.push({
      icon: "convert",
      label: "In Rechnung umwandeln",
      action: () => run(async () => { const d = await api(`/documents/${doc.id}/convert`, "POST", {}); await ctx.refreshMe(); onCreated?.(d); }, "Rechnung erstellt"),
    });
    if (doc.status !== "accepted") items.push({ icon: "check", label: "Als angenommen markieren", action: () => setStatus("accepted", "Angebot angenommen") });
    if (doc.status !== "declined") items.push({ icon: "x", label: "Als abgelehnt markieren", action: () => setStatus("declined", "Als abgelehnt markiert") });
  }
  items.push(
    { icon: "copy", label: "Duplizieren", action: () => run(async () => { const d = await api(`/documents/${doc.id}/duplicate`, "POST", {}); await ctx.refreshMe(); onCreated?.(d); }, "Kopie erstellt") },
    "-",
  );
  if (isInvoice && doc.status !== "cancelled") {
    items.push({ icon: "x", label: "Stornieren", action: async () => { if (await confirmDialog("Rechnung stornieren?", "Die Rechnung bleibt erhalten, zählt aber nicht mehr zum Umsatz.", { label: "Stornieren", danger: true })) setStatus("cancelled", "Rechnung storniert"); } });
  }
  items.push({
    icon: "trash",
    label: "Löschen",
    danger: true,
    action: async () => {
      if (!(await confirmDialog(`${isInvoice ? "Rechnung" : "Angebot"} ${doc.number} löschen?`, isInvoice ? "Tipp: Verschickte Rechnungen solltest du aus steuerlichen Gründen lieber stornieren statt löschen." : "Das lässt sich nicht rückgängig machen.", { label: "Endgültig löschen", danger: true }))) return;
      await run(async () => { await api(`/documents/${doc.id}`, "DELETE"); await (onDeleted || onChange)?.(); }, "Gelöscht");
    },
  });
  return items;
}
