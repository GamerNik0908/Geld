import { html, eur } from "../ui.js";
import { crudView } from "./crud.js";

const UNITS = ["Stk.", "Std.", "Tag", "pausch.", "Monat", "km", "m²", "Seite"];

export default crudView({
  endpoint: "/products",
  title: "Produkte & Leistungen",
  subtitle: "Dein Katalog: einmal mit Preis anlegen, dann per Klick in jede Rechnung und jedes Angebot übernehmen.",
  addLabel: "Neues Produkt",
  editTitle: "Produkt bearbeiten",
  limitKey: "maxProducts",
  searchText: (r) => `${r.name} ${r.description}`,
  deleteText: "Bestehende Rechnungen bleiben unverändert erhalten.",
  empty: { iconName: "package", title: "Dein Katalog ist leer", text: "Lege Leistungen wie „Webdesign (Std.)“ oder Produkte mit festem Preis an. Beim Schreiben einer Rechnung genügt dann ein Klick." },
  columns: [
    { label: "Name", cell: (r) => html`<span class="strong">${r.name}</span>${r.description ? html`<span class="sub">${r.description}</span>` : ""}` },
    { label: "Einheit", cls: "hide-m", cell: (r) => r.unit },
    { label: "USt.", cls: "hide-m", cell: (r) => `${r.tax_rate} %` },
    { label: "Preis (netto)", cls: "r", cell: (r) => html`<span class="strong num">${eur(r.price_cents / 100)}</span>` },
  ],
  menu: () => [],
  form: (r, ctx) => html`
    <div style="display:flex;flex-direction:column;gap:14px">
      <label class="field"><span>Name *</span><input class="input" name="name" value="${r.name || ""}" placeholder="z. B. Webdesign" required autofocus></label>
      <label class="field"><span>Beschreibung <span class="hint">(erscheint als Detailzeile auf der Rechnung)</span></span><textarea class="textarea" name="description" rows="2">${r.description || ""}</textarea></label>
      <div class="grid-3">
        <label class="field"><span>Preis netto (€) *</span><input class="input num" name="price" type="number" step="0.01" min="0" value="${r.price_cents != null ? r.price_cents / 100 : ""}" required></label>
        <label class="field"><span>Einheit</span><select class="select" name="unit">${UNITS.map((u) => html`<option ${(r.unit || "Std.") === u ? "selected" : ""}>${u}</option>`)}</select></label>
        <label class="field"><span>USt.</span><select class="select" name="tax_rate">${[19, 7, 0].map((t) => html`<option value="${t}" ${Number(r.tax_rate ?? ctx.me.settings.defaultTaxRate) === t ? "selected" : ""}>${t} %</option>`)}</select></label>
      </div>
    </div>`,
});
