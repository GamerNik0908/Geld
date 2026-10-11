import { api } from "../api.js";
import { html, ic, eur, toast, hashQuery, confirmDialog } from "../ui.js";

const FEATURES = [
  ["Rechnungen & Angebote pro Monat", "3", "Unbegrenzt"],
  ["Kunden & Produkte", "je 5", "Unbegrenzt"],
  ["PDF im DIN-5008-Layout", true, true],
  ["Angebot → Rechnung per Klick", true, true],
  ["GiroCode: Zahlung per QR-Scan", false, true],
  ["Eigenes Logo & Markenfarbe", false, true],
  ["Ohne Rechnungsblitz-Hinweis", false, true],
  ["Zahlungserinnerungen", false, true],
  ["CSV-Export für Steuerberater", false, true],
];

export default async function billing(root, ctx) {
  let interval = "year";
  const me = ctx.me;
  if (hashQuery().has("upgraded")) {
    toast("Willkommen bei Pro! Alle Funktionen sind freigeschaltet.");
    history.replaceState(null, "", "#/abo");
  }

  function render() {
    const { monthly, yearly } = me.prices;
    const price = interval === "year" ? yearly / 12 : monthly;
    const trialDays = me.trialEndsAt ? Math.max(1, Math.ceil((me.trialEndsAt - Date.now()) / 864e5)) : 0;
    const cell = (v) => (v === true ? ic("check") : v === false ? html`<span class="muted">–</span>` : v);

    root.innerHTML = String(html`
      <div class="page" style="max-width:960px">
        <div class="page-head"><div><h1>Abo & Plan</h1><p>${me.subscribed ? "Du nutzt Rechnungsblitz Pro. Danke für deine Unterstützung!" : trialDays ? `Du testest gerade Pro – noch ${trialDays} ${trialDays === 1 ? "Tag" : "Tage"}. Danach geht es kostenlos im Starter-Plan weiter.` : "Du nutzt den kostenlosen Starter-Plan."}</p></div></div>

        ${me.subscribed ? html`
          <div class="card plan current" style="margin-bottom:24px">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
              <div><span class="badge badge-primary plain">Aktiv</span><h2 style="margin-top:10px;font-size:20px">Rechnungsblitz Pro</h2><p class="muted">Rechnungen, Zahlungsart und Kündigung verwaltest du sicher bei unserem Zahlungsanbieter Stripe.</p></div>
              <button class="btn btn-secondary" id="portalBtn">${ic("card")}Abo verwalten / kündigen</button>
            </div>
          </div>` : html`
          <div style="display:flex;justify-content:center;margin-bottom:20px">
            <div class="seg"><button class="${interval === "month" ? "active" : ""}" data-interval="month">Monatlich</button><button class="${interval === "year" ? "active" : ""}" data-interval="year">Jährlich <span class="save-tag">2 Monate gratis</span></button></div>
          </div>
          <div class="plans" style="margin-bottom:28px">
            <div class="card plan ${!trialDays ? "current" : ""}">
              <div><h2 style="font-size:18px">Starter</h2><p class="muted">Zum Ausprobieren und für Gelegenheitsjobs.</p></div>
              <div class="price">0 € <small>für immer</small></div>
              <button class="btn btn-secondary" disabled>${!trialDays ? "Dein aktueller Plan" : "Danach automatisch"}</button>
            </div>
            <div class="card plan" style="border-color:color-mix(in srgb,var(--primary) 40%,var(--border))">
              <div><h2 style="font-size:18px;display:flex;gap:8px;align-items:center">Pro <span class="pro-pill">EMPFOHLEN</span></h2><p class="muted">Für Selbstständige, die professionell auftreten.</p></div>
              <div class="price num">${eur(price)} <small>/ Monat${interval === "year" ? `, ${eur(yearly)} jährlich` : ""}</small></div>
              <button class="btn btn-primary btn-lg" id="upgradeBtn">${ic("sparkles")}${trialDays ? "Pro behalten" : "Jetzt upgraden"}</button>
              <p class="hint" style="text-align:center">Sichere Zahlung über Stripe · Karte, PayPal, SEPA* · jederzeit kündbar</p>
            </div>
          </div>`}

        <div class="card">
          <div class="card-header"><h2>Was ist enthalten?</h2></div>
          <table class="table">
            <thead><tr><th>Funktion</th><th class="r">Starter</th><th class="r">Pro</th></tr></thead>
            <tbody>${FEATURES.map(([f, a, b]) => html`<tr><td>${f}</td><td class="r">${cell(a)}</td><td class="r" style="color:var(--success);font-weight:600">${cell(b)}</td></tr>`)}</tbody>
          </table>
        </div>
        <p class="hint" style="margin-top:12px">* verfügbare Zahlungsarten hängen von den Stripe-Einstellungen ab. Alle Preise sind Endpreise.</p>
        ${!me.billingEnabled ? html`<div class="alert alert-success" style="margin-top:16px">${ic("alert")}<span><strong>Testmodus:</strong> Es ist kein Stripe-Schlüssel hinterlegt. Upgrades werden ohne Zahlung freigeschaltet und lassen sich über „Abo verwalten“ zurücksetzen.</span></div>` : ""}
      </div>`);
  }

  render();
  root.addEventListener("click", async (e) => {
    const iv = e.target.closest("[data-interval]");
    if (iv) { interval = iv.dataset.interval; render(); return; }
    if (e.target.closest("#upgradeBtn")) {
      try { location.href = (await api("/checkout", "POST", { interval })).url; if (!me.billingEnabled) setTimeout(() => location.reload(), 50); } catch (err) { toast(err.message, "error"); }
    }
    if (e.target.closest("#portalBtn")) {
      if (!me.billingEnabled && !(await confirmDialog("Testmodus", "Pro wieder deaktivieren und zum Starter-Plan zurückkehren?", { label: "Zurücksetzen" }))) return;
      try { location.href = (await api("/portal", "POST", {})).url; if (!me.billingEnabled) setTimeout(() => location.reload(), 50); } catch (err) { toast(err.message, "error"); }
    }
  });
}
