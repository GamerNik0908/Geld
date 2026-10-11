import { api } from "../api.js";
import { html, ic, raw, eur, num, date, today, addDays, statusBadge, loading, toast, modal, popMenu, hashQuery } from "../ui.js";
import { documentActions } from "./doc-actions.js";

const TAX_RATES = [19, 7, 0];
const UNITS = ["Stk.", "Std.", "Tag", "pausch.", "Monat", "km", "m²", "Seite"];
const blankItem = (s) => ({ description: "", details: "", quantity: 1, unit: "Stk.", price: "", taxRate: s.defaultTaxRate, showDetails: false });

export default async function editor(root, ctx, { type: newType, id }, stale) {
  root.innerHTML = String(loading());
  const s = ctx.me.settings;
  const [existing, customers, products, next] = await Promise.all([
    id ? api(`/documents/${id}`) : null,
    api("/customers"),
    api("/products"),
    id ? null : api(`/documents/next-number?type=${newType}`),
  ]);
  if (stale()) return;

  const type = existing?.type || newType;
  const isInvoice = type === "invoice";
  const noun = isInvoice ? "Rechnung" : "Angebot";
  let doc = existing
    ? { ...existing, items: existing.items.map((i) => ({ ...i, showDetails: Boolean(i.details) })) }
    : {
        type,
        number: "",
        customer_id: null,
        customer_name: "",
        customer_address: "",
        customer_email: "",
        date: today(),
        service_date: isInvoice ? today() : "",
        due_date: addDays(today(), isInvoice ? s.paymentDays : s.quoteValidDays),
        items: [blankItem(s)],
        discount_pct: 0,
        intro: isInvoice ? s.invoiceIntro : s.quoteIntro,
        notes: isInvoice ? s.invoiceNotes : s.quoteNotes,
        small_business: s.smallBusiness,
      };
  const preselect = Number(hashQuery().get("kunde"));
  if (!existing && preselect) applyCustomer(customers.find((c) => c.id === preselect));
  let saveCustomer = false;
  let dirty = false;
  let tab = "form";

  function applyCustomer(c) {
    if (!c) return;
    Object.assign(doc, { customer_id: c.id, customer_name: c.name, customer_address: [c.contact, c.address].filter(Boolean).join("\n"), customer_email: c.email });
  }

  // ---------- Vorschau ----------
  function preview() {
    const t = calc.totals(doc.items.filter((i) => i.description), { discountPct: doc.discount_pct, smallBusiness: doc.small_business });
    const brand = ctx.isPro() ? s.brandColor : "#4f46e5";
    const items = doc.items.filter((i) => i.description);
    const sender = [s.name, ...s.address.split("\n")].filter(Boolean).join(" · ");
    const canQr = isInvoice && ctx.isPro() && s.iban;
    return html`
      <div class="paper">
        <div class="p-top">
          <div><div class="p-accent" style="background:${brand}"></div><div class="p-company">${s.name || "Dein Firmenname"}</div></div>
          ${ctx.isPro() && s.logo ? html`<img class="p-logo" src="${s.logo}" alt="">` : ""}
        </div>
        <div class="p-sender">${sender || "Absender – in den Einstellungen eintragen"}</div>
        <div class="p-addr-row">
          <div class="p-addr">${doc.customer_name || html`<span style="color:#9ca3af">Kunde</span>`}${doc.customer_address ? "\n" + doc.customer_address : ""}</div>
          <dl class="p-info">
            <dt>${isInvoice ? "Rechnungsnr." : "Angebotsnr."}</dt><dd>${doc.number || next?.number || ""}</dd>
            <dt>Datum</dt><dd>${date(doc.date)}</dd>
            ${doc.service_date ? html`<dt>Leistungsdatum</dt><dd>${date(doc.service_date)}</dd>` : ""}
            ${doc.due_date ? html`<dt>${isInvoice ? "Zahlbar bis" : "Gültig bis"}</dt><dd>${date(doc.due_date)}</dd>` : ""}
          </dl>
        </div>
        <h4>${noun} ${doc.number || next?.number || ""}</h4>
        ${doc.intro ? html`<div class="p-text">${doc.intro}</div>` : ""}
        <table>
          <thead><tr><th>Pos.</th><th>Beschreibung</th><th class="r">Menge</th><th class="r">Preis</th>${doc.small_business ? "" : html`<th class="r">USt.</th>`}<th class="r">Gesamt</th></tr></thead>
          <tbody>
            ${items.length ? items.map((i, n) => html`
              <tr><td>${n + 1}</td><td><b>${i.description}</b>${i.details ? html`<small>${i.details}</small>` : ""}</td>
                <td class="r">${num(i.quantity)} ${i.unit}</td><td class="r">${eur(i.price)}</td>${doc.small_business ? "" : html`<td class="r">${i.taxRate} %</td>`}<td class="r">${eur(calc.lineTotal(i))}</td></tr>`)
            : html`<tr><td colspan="6" style="color:#9ca3af;text-align:center;padding:2em 0">Noch keine Positionen</td></tr>`}
          </tbody>
        </table>
        <div class="p-sum">
          ${t.discount ? html`<div><span>Zwischensumme</span><span>${eur(t.subtotal)}</span></div><div><span>Rabatt (${num(doc.discount_pct)} %)</span><span>- ${eur(t.discount)}</span></div>` : ""}
          ${doc.small_business ? "" : html`<div><span>Nettobetrag</span><span>${eur(t.net)}</span></div>${t.taxes.map((x) => html`<div><span>zzgl. ${x.rate} % USt.</span><span>${eur(x.tax)}</span></div>`)}`}
          <div class="p-grand" style="background:${brand}"><span>Gesamtbetrag</span><span>${eur(t.total)}</span></div>
        </div>
        <div class="p-pay">
          <div class="p-text">${doc.small_business ? "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.\n\n" : ""}${isInvoice ? `Bitte überweisen Sie den Betrag bis zum ${date(doc.due_date)} unter Angabe der Rechnungsnummer.${s.iban ? `\nIBAN ${s.iban}` : ""}\n\n` : ""}${doc.notes}</div>
          ${canQr ? html`<div class="p-qr">GiroCode<br>im PDF</div>` : ""}
        </div>
        <div class="p-foot"><span>${[s.name, s.address].filter(Boolean).join("\n")}</span><span>${[s.email, s.phone].filter(Boolean).join("\n")}</span><span>${[s.bank, s.iban && "IBAN " + s.iban].filter(Boolean).join("\n")}</span></div>
        ${ctx.isPro() ? "" : html`<div class="p-wm">Erstellt mit Rechnungsblitz – kostenlos Rechnungen schreiben</div>`}
      </div>`;
  }

  // ---------- Formular ----------
  const itemRow = (it, i) => html`
    <div class="item ${doc.small_business ? "no-tax" : ""}" data-row="${i}">
      <div class="desc">
        <input class="input" data-item="${i}" data-k="description" placeholder="Leistung oder Produkt" value="${it.description}" list="productList" aria-label="Beschreibung">
        ${it.showDetails ? html`<textarea class="textarea details" data-item="${i}" data-k="details" rows="2" placeholder="Details (optional)">${it.details}</textarea>` : ""}
      </div>
      <div data-m-label="Menge"><input class="input num" data-item="${i}" data-k="quantity" type="number" step="any" min="0" value="${it.quantity}" aria-label="Menge"></div>
      <div data-m-label="Einheit"><input class="input" data-item="${i}" data-k="unit" value="${it.unit}" list="unitList" aria-label="Einheit"></div>
      <div data-m-label="Einzelpreis (netto)"><input class="input num" data-item="${i}" data-k="price" type="number" step="0.01" placeholder="0,00" value="${it.price}" aria-label="Einzelpreis"></div>
      ${doc.small_business ? "" : html`<div data-m-label="USt."><select class="select" data-item="${i}" data-k="taxRate" aria-label="Steuersatz">${TAX_RATES.map((r) => html`<option value="${r}" ${Number(it.taxRate) === r ? "selected" : ""}>${r} %</option>`)}</select></div>`}
      <div class="line-total num" data-total="${i}">${eur(calc.lineTotal(it))}</div>
      <div class="item-tools"><button type="button" class="btn btn-ghost btn-icon btn-sm" data-row-menu="${i}" aria-label="Weitere Aktionen" style="margin-top:4px">${ic("more")}</button></div>
    </div>`;

  function form() {
    const quick = products.slice(0, 8);
    return html`
      <div class="stack">
        <div class="card">
          <div class="card-header"><h3>Kunde</h3>
            ${customers.length ? html`<select class="select" id="customerSelect" style="width:auto;min-width:220px;height:34px">
              <option value="">${doc.customer_id ? "– anderen Kunden wählen –" : "Gespeicherten Kunden wählen…"}</option>
              ${customers.map((c) => html`<option value="${c.id}" ${doc.customer_id === c.id ? "selected" : ""}>${c.name}</option>`)}
            </select>` : ""}
          </div>
          <div class="card-body" style="display:flex;flex-direction:column;gap:14px">
            <div class="grid-2">
              <label class="field"><span>Name / Firma *</span><input class="input" data-f="customer_name" value="${doc.customer_name}" placeholder="z. B. Muster GmbH" required></label>
              <label class="field"><span>E-Mail</span><input class="input" type="email" data-f="customer_email" value="${doc.customer_email}" placeholder="kunde@beispiel.de"></label>
            </div>
            <label class="field"><span>Anschrift</span><textarea class="textarea" data-f="customer_address" rows="3" placeholder="Ansprechpartner&#10;Straße Nr.&#10;PLZ Ort">${doc.customer_address}</textarea></label>
            ${!doc.customer_id ? html`<label class="check"><input type="checkbox" id="saveCustomer" ${saveCustomer ? "checked" : ""}><span>Als Kunden speichern – nächstes Mal mit einem Klick auswählen</span></label>` : ""}
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3>Positionen</h3><button type="button" class="btn btn-secondary btn-sm" id="catalogBtn">${ic("package")}Aus Katalog</button></div>
          <div class="card-body">
            ${quick.length ? html`
              <div style="margin-bottom:16px"><div class="label" style="margin-bottom:8px">Schnell hinzufügen</div>
                <div class="chips">${quick.map((p) => html`<button type="button" class="chip" data-add-product="${p.id}">${ic("plus")}${p.name}<span class="price num">${eur(p.price_cents / 100)}</span></button>`)}</div></div>`
            : html`<div class="alert" style="border-color:var(--border);background:var(--surface-2);color:var(--text-2);margin-bottom:16px">${ic("sparkles")}<span>Tipp: Speichere wiederkehrende Leistungen unter <a href="#/produkte">Produkte & Leistungen</a> – dann fügst du sie hier mit einem Klick ein.</span></div>`}
            <div class="items">
              <div class="item head ${doc.small_business ? "no-tax" : ""}"><span>Beschreibung</span><span>Menge</span><span>Einheit</span><span>Preis (netto)</span>${doc.small_business ? "" : html`<span>USt.</span>`}<span style="text-align:right">Gesamt</span><span></span></div>
              ${doc.items.map(itemRow)}
            </div>
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-top:16px;flex-wrap:wrap">
              <button type="button" class="btn btn-ghost" id="addItem">${ic("plus")}Position hinzufügen</button>
              <div class="totals" id="totals"></div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3>Details</h3></div>
          <div class="card-body" style="display:flex;flex-direction:column;gap:16px">
            <div class="grid-2">
              <label class="field"><span>${isInvoice ? "Rechnungsnummer" : "Angebotsnummer"}</span><input class="input" data-f="number" value="${doc.number}" placeholder="${next ? next.number + " (automatisch)" : ""}"></label>
              <label class="field"><span>${isInvoice ? "Rechnungsdatum" : "Angebotsdatum"}</span><input class="input" type="date" data-f="date" value="${doc.date}"></label>
              ${isInvoice ? html`<label class="field"><span>Leistungsdatum</span><input class="input" type="date" data-f="service_date" value="${doc.service_date}"></label>` : ""}
              <label class="field"><span>${isInvoice ? "Zahlbar bis" : "Gültig bis"}</span><input class="input" type="date" data-f="due_date" value="${doc.due_date}"></label>
              <label class="field"><span>Rabatt</span><div class="input-group"><input class="input num" type="number" min="0" max="100" step="0.5" data-f="discount_pct" value="${doc.discount_pct || ""}" placeholder="0"><span class="input-suffix">%</span></div></label>
            </div>
            <label class="check" style="align-items:center"><span class="switch"><input type="checkbox" id="smallBusiness" ${doc.small_business ? "checked" : ""}><span></span></span>
              <span>Kleinunternehmer nach § 19 UStG <span class="hint">(keine Umsatzsteuer ausweisen)</span></span></label>
            <label class="field"><span>Einleitungstext</span><textarea class="textarea" data-f="intro" rows="2">${doc.intro}</textarea></label>
            <label class="field"><span>Schlusstext</span><textarea class="textarea" data-f="notes" rows="2">${doc.notes}</textarea></label>
          </div>
        </div>
      </div>
      <datalist id="productList">${products.map((p) => html`<option value="${p.name}">`)}</datalist>
      <datalist id="unitList">${UNITS.map((u) => html`<option value="${u}">`)}</datalist>`;
  }

  function totalsHtml() {
    const t = calc.totals(doc.items.filter((i) => i.description), { discountPct: doc.discount_pct, smallBusiness: doc.small_business });
    return html`
      ${t.discount ? html`<div><span>Zwischensumme</span><span class="num">${eur(t.subtotal)}</span></div><div><span>Rabatt</span><span class="num">- ${eur(t.discount)}</span></div>` : ""}
      ${doc.small_business ? "" : html`<div><span>Netto</span><span class="num">${eur(t.net)}</span></div>${t.taxes.map((x) => html`<div><span>USt. ${x.rate} %</span><span class="num">${eur(x.tax)}</span></div>`)}`}
      <div class="grand"><span>Gesamt</span><span class="num">${eur(t.total)}</span></div>`;
  }

  // ---------- Seite ----------
  function render() {
    const listHash = isInvoice ? "#/rechnungen" : "#/angebote";
    root.innerHTML = String(html`
      <div class="page" style="max-width:1440px">
        <a class="backlink" href="${listHash}">${ic("back")}${isInvoice ? "Alle Rechnungen" : "Alle Angebote"}</a>
        <div class="page-head">
          <div class="doc-bar"><h1>${existing ? `${noun} ${existing.number}` : `Neue${isInvoice ? "" : "s"} ${noun}`}</h1>${existing ? statusBadge(existing.display_status) : ""}</div>
          <div class="page-actions">
            ${existing ? html`
              <button class="btn btn-secondary" id="moreBtn">${ic("more")}Aktionen</button>
              <button class="btn btn-secondary" id="pdfBtn">${ic("download")}PDF</button>` : ""}
            <button class="btn btn-primary" id="saveBtn">${ic("check")}${existing ? "Speichern" : "Erstellen"}</button>
            ${existing ? "" : html`<button class="btn btn-secondary" id="savePdfBtn">${ic("download")}Erstellen & PDF</button>`}
          </div>
        </div>
        <div class="seg editor-tabs"><button class="${tab === "form" ? "active" : ""}" data-tab="form">${ic("edit")} Bearbeiten</button><button class="${tab === "preview" ? "active" : ""}" data-tab="preview">${ic("eye")} Vorschau</button></div>
        <div class="editor" data-tab="${tab}">
          <div class="editor-form" id="form">${form()}</div>
          <div class="editor-preview"><div class="paper-wrap" id="preview">${preview()}</div>
            <p class="hint" style="margin-top:10px;text-align:center">Live-Vorschau · das PDF wird im DIN-A4-Format erzeugt</p></div>
        </div>
      </div>`);
    updateTotals();
  }

  function updateTotals() {
    root.querySelector("#totals").innerHTML = String(totalsHtml());
    root.querySelector("#preview").innerHTML = String(preview());
  }

  function rerenderForm() {
    root.querySelector("#form").innerHTML = String(form());
    updateTotals();
  }

  function addProduct(p) {
    const item = { description: p.name, details: p.description, quantity: 1, unit: p.unit, price: p.price_cents / 100, taxRate: p.tax_rate, showDetails: Boolean(p.description) };
    const last = doc.items.at(-1);
    if (last && !last.description && !last.price) doc.items[doc.items.length - 1] = item;
    else doc.items.push(item);
    dirty = true;
    rerenderForm();
  }

  render();

  // ---------- Ereignisse ----------
  root.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.f) {
      doc[t.dataset.f] = t.dataset.f === "discount_pct" ? Number(t.value) || 0 : t.value;
      if (t.dataset.f === "date" && !existing) {
        doc.due_date = addDays(t.value || today(), isInvoice ? s.paymentDays : s.quoteValidDays);
        root.querySelector('[data-f="due_date"]').value = doc.due_date;
      }
    } else if (t.dataset.item) {
      const it = doc.items[t.dataset.item];
      it[t.dataset.k] = t.value;
      if (t.dataset.k === "description") {
        const p = products.find((p) => p.name === t.value);
        if (p && !it.price) {
          Object.assign(it, { price: p.price_cents / 100, unit: p.unit, taxRate: p.tax_rate, details: p.description, showDetails: Boolean(p.description) });
          rerenderForm();
          root.querySelector(`[data-item="${t.dataset.item}"][data-k="quantity"]`)?.focus();
          dirty = true;
          return;
        }
      }
      const cell = root.querySelector(`[data-total="${t.dataset.item}"]`);
      if (cell) cell.textContent = eur(calc.lineTotal(it));
    } else return;
    dirty = true;
    updateTotals();
  });

  root.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "customerSelect") {
      const c = customers.find((c) => c.id === Number(t.value));
      if (c) applyCustomer(c);
      dirty = true;
      rerenderForm();
    } else if (t.id === "smallBusiness") {
      doc.small_business = t.checked;
      dirty = true;
      rerenderForm();
    } else if (t.id === "saveCustomer") {
      saveCustomer = t.checked;
    }
  });

  root.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.tab) {
      tab = b.dataset.tab;
      root.querySelector(".editor").dataset.tab = tab;
      root.querySelectorAll(".editor-tabs button").forEach((x) => x.classList.toggle("active", x.dataset.tab === tab));
    } else if (b.id === "addItem") {
      doc.items.push(blankItem(s));
      rerenderForm();
      root.querySelector(`[data-item="${doc.items.length - 1}"][data-k="description"]`)?.focus();
    } else if (b.dataset.addProduct) {
      addProduct(products.find((p) => p.id === Number(b.dataset.addProduct)));
    } else if (b.dataset.rowMenu) {
      const i = Number(b.dataset.rowMenu);
      const it = doc.items[i];
      popMenu(b, [
        { icon: "edit", label: it.showDetails ? "Details ausblenden" : "Details hinzufügen", action: () => { it.showDetails = !it.showDetails; if (!it.showDetails) it.details = ""; rerenderForm(); } },
        ...(i > 0 ? [{ icon: "up", label: "Nach oben", action: () => { doc.items.splice(i - 1, 0, ...doc.items.splice(i, 1)); rerenderForm(); } }] : []),
        ...(i < doc.items.length - 1 ? [{ icon: "down", label: "Nach unten", action: () => { doc.items.splice(i + 1, 0, ...doc.items.splice(i, 1)); rerenderForm(); } }] : []),
        { icon: "copy", label: "Duplizieren", action: () => { doc.items.splice(i + 1, 0, { ...it }); rerenderForm(); } },
        { icon: "bookmark", label: "Als Produkt speichern", action: () => saveAsProduct(it) },
        "-",
        { icon: "trash", label: "Entfernen", danger: true, action: () => { doc.items.splice(i, 1); if (!doc.items.length) doc.items.push(blankItem(s)); dirty = true; rerenderForm(); } },
      ]);
    } else if (b.id === "catalogBtn") {
      openCatalog();
    } else if (b.id === "saveBtn") {
      save();
    } else if (b.id === "savePdfBtn") {
      const win = window.open("about:blank", "_blank");
      const saved = await save({ stay: true });
      if (saved && win) win.location = `/api/documents/${saved.id}/pdf`;
      else win?.close();
      if (saved) ctx.navigate(`#/beleg/${saved.id}`);
    } else if (b.id === "pdfBtn") {
      if (dirty && !(await save({ stay: true }))) return;
      window.open(`/api/documents/${existing.id}/pdf`, "_blank");
    } else if (b.id === "moreBtn") {
      popMenu(b, documentActions(existing, ctx, {
        onChange: () => ctx.reload(),
        onCreated: (d) => ctx.navigate(`#/beleg/${d.id}`),
        onDeleted: () => ctx.navigate(isInvoice ? "#/rechnungen" : "#/angebote"),
      }));
    }
  });

  async function saveAsProduct(it) {
    if (!it.description) return toast("Bitte zuerst eine Beschreibung eingeben.", "error");
    try {
      const p = await api("/products", "POST", { name: it.description, description: it.details, unit: it.unit, price: it.price, tax_rate: it.taxRate });
      products.push(p);
      await ctx.refreshMe();
      rerenderForm();
      toast(`„${p.name}“ im Katalog gespeichert`);
    } catch (err) {
      ctx.handleError(err);
    }
  }

  async function openCatalog() {
    if (!products.length) {
      const { value } = await modal({
        title: "Dein Katalog ist noch leer",
        body: html`<p class="muted">Lege Produkte und Leistungen mit Preis an – danach fügst du sie hier mit einem Klick in jede Rechnung ein.</p>`,
        actions: [{ label: "Schließen", value: "cancel" }, { label: "Produkte anlegen", value: "go", cls: "btn-primary" }],
      });
      if (value === "go") ctx.navigate("#/produkte");
      return;
    }
    const list = (q = "") => products
      .filter((p) => !q || (p.name + p.description).toLowerCase().includes(q.toLowerCase()))
      .map((p) => String(html`<button type="button" class="picker-item" data-pick="${p.id}"><div class="doc-icon">${ic("package")}</div><div class="grow"><strong>${p.name}</strong><div class="hint">${p.description || p.unit}</div></div><strong class="num">${eur(p.price_cents / 100)}</strong></button>`))
      .join("") || '<p class="muted">Keine Treffer.</p>';
    await modal({
      title: "Aus Katalog hinzufügen",
      body: html`<div class="input-group" style="margin-bottom:14px">${ic("search")}<input class="input" id="pickSearch" placeholder="Suchen…" autofocus></div><div id="pickList">${raw(list())}</div>`,
      onOpen: (dlg, close) => {
        dlg.querySelector("#pickSearch").addEventListener("input", (e) => { dlg.querySelector("#pickList").innerHTML = list(e.target.value); });
        dlg.addEventListener("click", (e) => {
          const pick = e.target.closest("[data-pick]");
          if (!pick) return;
          addProduct(products.find((p) => p.id === Number(pick.dataset.pick)));
          toast("Position hinzugefügt");
          close();
        });
      },
    });
  }

  async function save({ stay = false } = {}) {
    const items = doc.items.filter((i) => i.description.trim());
    if (!doc.customer_name.trim()) { toast("Bitte gib einen Kunden an.", "error"); root.querySelector('[data-f="customer_name"]')?.focus(); return null; }
    if (!items.length) { toast("Bitte füge mindestens eine Position hinzu.", "error"); return null; }
    const btns = root.querySelectorAll("#saveBtn, #savePdfBtn");
    btns.forEach((x) => (x.disabled = true));
    try {
      if (saveCustomer && !doc.customer_id) {
        try {
          const c = await api("/customers", "POST", { name: doc.customer_name, address: doc.customer_address, email: doc.customer_email });
          doc.customer_id = c.id;
        } catch (err) {
          if (err.status !== 402) throw err;
          toast("Kunde nicht gespeichert: Starter-Limit erreicht", "error");
        }
      }
      const body = { ...doc, items: items.map(({ showDetails, ...i }) => ({ ...i, quantity: Number(i.quantity) || 0, price: Number(i.price) || 0 })) };
      const saved = existing ? await api(`/documents/${existing.id}`, "PUT", body) : await api("/documents", "POST", body);
      dirty = false;
      await ctx.refreshMe();
      toast(existing ? "Gespeichert" : `${noun} ${saved.number} erstellt`);
      if (!stay) {
        if (existing) ctx.reload();
        else ctx.navigate(`#/beleg/${saved.id}`);
      }
      return saved;
    } catch (err) {
      ctx.handleError(err);
      return null;
    } finally {
      btns.forEach((x) => (x.disabled = false));
    }
  }

  const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
  window.addEventListener("beforeunload", warn);
  return () => window.removeEventListener("beforeunload", warn);
}

