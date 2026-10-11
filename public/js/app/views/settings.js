import { api } from "../api.js";
import { html, ic, toast, confirmDialog, modal } from "../ui.js";

function validIban(iban) {
  const s = iban.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const moved = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => c.charCodeAt(0) - 55);
  let rest = 0;
  for (const d of moved) rest = (rest * 10 + Number(d)) % 97;
  return rest === 1;
}

const SECTIONS = [
  ["firma", "Unternehmen", "building"],
  ["bank", "Bankverbindung", "banknote"],
  ["steuer", "Steuern", "percent"],
  ["nummern", "Nummern & Fristen", "hash"],
  ["texte", "Standardtexte", "edit"],
  ["design", "Logo & Farbe", "image"],
  ["konto", "Konto & Daten", "shield"],
];

export default async function settings(root, ctx) {
  const pro = ctx.isPro();

  function render() {
    const s = ctx.me.settings;
    const section = (id, title, desc, body, { save = true, badge = "" } = {}) => html`
      <form class="card form-section" id="${id}" data-section="${id}">
        <div class="card-header"><div><h2>${title} ${badge}</h2><p class="hint" style="margin-top:2px">${desc}</p></div></div>
        <div class="card-body">${body}</div>
        ${save ? html`<div class="form-foot"><button class="btn btn-primary btn-sm">Speichern</button></div>` : ""}
      </form>`;

    root.innerHTML = String(html`
      <div class="page">
        <div class="page-head"><div><h1>Einstellungen</h1><p>Diese Angaben erscheinen auf deinen Rechnungen und Angeboten.</p></div></div>
        <div class="settings">
          <nav class="settings-nav">${SECTIONS.map(([id, label, i]) => html`<a href="#" data-jump="${id}" style="display:flex;gap:10px;align-items:center">${ic(i)}${label}</a>`)}</nav>
          <div class="stack">
            ${section("firma", "Unternehmen", "Dein Name oder Firmenname und deine Kontaktdaten.", html`
              <div class="grid-2">
                <label class="field"><span>Name / Firma</span><input class="input" name="name" value="${s.name}" placeholder="Max Mustermann Design"></label>
                <label class="field"><span>E-Mail</span><input class="input" type="email" name="email" value="${s.email}"></label>
              </div>
              <label class="field"><span>Anschrift</span><textarea class="textarea" name="address" rows="2" placeholder="Straße Nr.&#10;PLZ Ort">${s.address}</textarea></label>
              <div class="grid-2">
                <label class="field"><span>Telefon</span><input class="input" name="phone" value="${s.phone}"></label>
                <label class="field"><span>Website</span><input class="input" name="website" value="${s.website}" placeholder="www.beispiel.de"></label>
              </div>`)}

            ${section("bank", "Bankverbindung", "Für den Zahlungshinweis und den GiroCode auf der Rechnung.", html`
              <label class="field"><span>IBAN</span><input class="input" name="iban" id="iban" value="${s.iban}" placeholder="DE00 0000 0000 0000 0000 00" autocomplete="off"><span class="hint" id="ibanHint"></span></label>
              <div class="grid-2">
                <label class="field"><span>BIC <span class="hint">(optional)</span></span><input class="input" name="bic" value="${s.bic}"></label>
                <label class="field"><span>Bank</span><input class="input" name="bank" value="${s.bank}"></label>
              </div>`)}

            ${section("steuer", "Steuern", "Steuernummer oder USt-IdNr. ist eine Pflichtangabe auf Rechnungen.", html`
              <label class="check" style="align-items:center"><span class="switch"><input type="checkbox" name="smallBusiness" ${s.smallBusiness ? "checked" : ""}><span></span></span>
                <span>Ich bin Kleinunternehmer nach § 19 UStG <span class="hint">(keine Umsatzsteuer auf Rechnungen)</span></span></label>
              <div class="grid-3">
                <label class="field"><span>Steuernummer</span><input class="input" name="taxNumber" value="${s.taxNumber}" placeholder="12/345/67890"></label>
                <label class="field"><span>USt-IdNr.</span><input class="input" name="vatId" value="${s.vatId}" placeholder="DE123456789"></label>
                <label class="field"><span>Standard-Steuersatz</span><select class="select" name="defaultTaxRate">${[19, 7, 0].map((t) => html`<option value="${t}" ${s.defaultTaxRate === t ? "selected" : ""}>${t} %</option>`)}</select></label>
              </div>`)}

            ${section("nummern", "Nummern & Fristen", "Rechnungsnummern müssen fortlaufend und eindeutig sein. {JAHR} wird automatisch ersetzt.", html`
              <div class="grid-2">
                <label class="field"><span>Präfix Rechnungen</span><input class="input" name="invoicePrefix" value="${s.invoicePrefix}"></label>
                <label class="field"><span>Nächste Rechnungsnummer</span><input class="input num" type="number" min="1" name="nextInvoice" value="${s.nextInvoice}"></label>
                <label class="field"><span>Präfix Angebote</span><input class="input" name="quotePrefix" value="${s.quotePrefix}"></label>
                <label class="field"><span>Nächste Angebotsnummer</span><input class="input num" type="number" min="1" name="nextQuote" value="${s.nextQuote}"></label>
                <label class="field"><span>Zahlungsziel (Tage)</span><input class="input num" type="number" min="0" name="paymentDays" value="${s.paymentDays}"></label>
                <label class="field"><span>Angebote gültig (Tage)</span><input class="input num" type="number" min="0" name="quoteValidDays" value="${s.quoteValidDays}"></label>
              </div>
              <p class="hint">Vorschau: <strong id="numPreview"></strong></p>`)}

            ${section("texte", "Standardtexte", "Werden bei neuen Belegen vorausgefüllt und lassen sich pro Beleg ändern.", html`
              <label class="field"><span>Rechnung – Einleitung</span><textarea class="textarea" name="invoiceIntro" rows="2">${s.invoiceIntro}</textarea></label>
              <label class="field"><span>Rechnung – Schlusstext</span><textarea class="textarea" name="invoiceNotes" rows="2">${s.invoiceNotes}</textarea></label>
              <label class="field"><span>Angebot – Einleitung</span><textarea class="textarea" name="quoteIntro" rows="2">${s.quoteIntro}</textarea></label>
              <label class="field"><span>Angebot – Schlusstext</span><textarea class="textarea" name="quoteNotes" rows="2">${s.quoteNotes}</textarea></label>`)}

            ${section("design", "Logo & Farbe", "Dein Branding auf jedem PDF – ohne Rechnungsblitz-Hinweis.", html`
              <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
                <div class="logo-preview">${s.logo ? html`<img src="${s.logo}" alt="Logo">` : "Kein Logo"}</div>
                <div style="display:flex;flex-direction:column;gap:8px">
                  <div style="display:flex;gap:8px;flex-wrap:wrap">
                    <label class="btn btn-secondary btn-sm" style="${pro ? "" : "pointer-events:none;opacity:.5"}">${ic("image")}Logo hochladen<input type="file" id="logoFile" accept="image/png,image/jpeg" hidden ${pro ? "" : "disabled"}></label>
                    ${s.logo ? html`<button type="button" class="btn btn-ghost btn-sm" id="removeLogo">Entfernen</button>` : ""}
                  </div>
                  <span class="hint">PNG oder JPG, max. 300 KB. Am besten mit transparentem Hintergrund.</span>
                </div>
              </div>
              <label class="field" style="max-width:240px"><span>Markenfarbe</span>
                <div style="display:flex;gap:10px;align-items:center"><input type="color" name="brandColor" value="${s.brandColor}" ${pro ? "" : "disabled"} style="width:44px;height:40px;border:1px solid var(--border-strong);border-radius:8px;padding:3px;background:var(--surface)"><span class="hint">für Akzente und den Gesamtbetrag</span></div></label>
              ${pro ? "" : html`<div class="locked-note">${ic("lock")}Logo & Markenfarbe sind in Pro enthalten. <a href="#/abo">Jetzt freischalten</a></div>`}`,
              { badge: pro ? "" : html`<span class="pro-pill">PRO</span>`, save: pro })}

            ${section("konto", "Konto & Daten", ctx.me.email, html`
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button type="button" class="btn btn-secondary btn-sm" id="pwBtn">${ic("lock")}Passwort ändern</button>
                <a class="btn btn-secondary btn-sm" href="/api/export.json">${ic("download")}Alle Daten exportieren (JSON)</a>
              </div>
              <hr class="divider">
              <div><strong style="font-size:14px">Konto löschen</strong><p class="hint" style="margin:4px 0 10px">Löscht dein Konto mit allen Kunden, Produkten und Belegen unwiderruflich. Denk an die gesetzliche Aufbewahrungspflicht für Rechnungen – exportiere sie vorher.</p>
                <button type="button" class="btn btn-danger btn-sm" id="deleteBtn">${ic("trash")}Konto löschen</button></div>`, { save: false })}
          </div>
        </div>
      </div>`);
    updateIbanHint();
    updateNumPreview();
  }

  function updateIbanHint() {
    const v = root.querySelector("#iban").value.trim();
    const hint = root.querySelector("#ibanHint");
    hint.textContent = !v ? "" : validIban(v) ? "✓ Gültige IBAN – GiroCode wird erzeugt (Pro)" : "Diese IBAN scheint nicht gültig zu sein.";
    hint.style.color = !v ? "" : validIban(v) ? "var(--success)" : "var(--danger)";
  }

  function updateNumPreview() {
    const f = root.querySelector("#nummern");
    const pre = (f.invoicePrefix.value || "").replace(/\{JAHR\}/g, new Date().getFullYear()).replace(/\{MONAT\}/g, String(new Date().getMonth() + 1).padStart(2, "0"));
    root.querySelector("#numPreview").textContent = pre + String(f.nextInvoice.value || 1).padStart(4, "0");
  }

  async function saveSettings(data, msg = "Gespeichert") {
    try {
      ctx.me.settings = await api("/settings", "PUT", data);
      await ctx.refreshMe();
      toast(msg);
      return true;
    } catch (err) {
      ctx.handleError(err);
      return false;
    }
  }

  render();

  root.addEventListener("input", (e) => {
    if (e.target.id === "iban") updateIbanHint();
    if (e.target.closest("#nummern")) updateNumPreview();
  });

  root.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));
    if (form.dataset.section === "steuer") data.smallBusiness = form.smallBusiness.checked;
    await saveSettings(data);
  });

  root.addEventListener("change", async (e) => {
    if (e.target.id !== "logoFile") return;
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 300 * 1024) return toast("Das Logo ist zu groß (max. 300 KB).", "error");
    const dataUrl = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(file); });
    if (await saveSettings({ logo: dataUrl }, "Logo gespeichert")) render();
  });

  root.addEventListener("click", async (e) => {
    const jump = e.target.closest("[data-jump]");
    if (jump) { e.preventDefault(); root.querySelector("#" + jump.dataset.jump).scrollIntoView({ behavior: "smooth" }); return; }
    if (e.target.closest("#removeLogo")) { if (await saveSettings({ logo: "" }, "Logo entfernt")) render(); return; }
    if (e.target.closest("#pwBtn")) {
      const { value, data } = await modal({
        title: "Passwort ändern",
        body: html`<div style="display:flex;flex-direction:column;gap:14px">
          <label class="field"><span>Aktuelles Passwort</span><input class="input" type="password" name="current" required autocomplete="current-password"></label>
          <label class="field"><span>Neues Passwort</span><input class="input" type="password" name="next" required minlength="8" autocomplete="new-password"><span class="hint">Mindestens 8 Zeichen</span></label></div>`,
        actions: [{ label: "Abbrechen", value: "cancel" }, { label: "Ändern", value: "ok", cls: "btn-primary" }],
      });
      if (value !== "ok") return;
      try { await api("/password", "POST", data); toast("Passwort geändert"); } catch (err) { toast(err.message, "error"); }
      return;
    }
    if (e.target.closest("#deleteBtn")) {
      if (!(await confirmDialog("Konto wirklich löschen?", "Alle Daten werden unwiderruflich gelöscht.", { label: "Weiter", danger: true }))) return;
      const { value, data } = await modal({
        title: "Mit Passwort bestätigen",
        body: html`<label class="field"><span>Passwort</span><input class="input" type="password" name="password" required></label>`,
        actions: [{ label: "Abbrechen", value: "cancel" }, { label: "Konto endgültig löschen", value: "ok", cls: "btn-danger" }],
      });
      if (value !== "ok") return;
      try { await api("/account", "DELETE", data); location.href = "/?geloescht=1"; } catch (err) { toast(err.message, "error"); }
    }
  });
}
