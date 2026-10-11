import { html } from "../ui.js";
import { crudView } from "./crud.js";

export default crudView({
  endpoint: "/customers",
  title: "Kunden",
  subtitle: "Speichere deine Kunden einmal – und wähle sie bei jeder Rechnung mit einem Klick aus.",
  addLabel: "Neuer Kunde",
  editTitle: "Kunde bearbeiten",
  limitKey: "maxCustomers",
  searchText: (r) => `${r.name} ${r.contact} ${r.email} ${r.address}`,
  deleteText: "Bestehende Rechnungen bleiben unverändert erhalten.",
  empty: { iconName: "users", title: "Noch keine Kunden", text: "Lege deinen ersten Kunden an. Name und Anschrift landen dann automatisch auf jeder Rechnung." },
  columns: [
    { label: "Name", cell: (r) => html`<span class="strong">${r.name}</span>${r.contact ? html`<span class="sub">${r.contact}</span>` : ""}` },
    { label: "E-Mail", cls: "hide-m", cell: (r) => r.email || html`<span class="muted">–</span>` },
    { label: "Ort", cls: "hide-m", cell: (r) => r.address.split("\n").at(-1) || html`<span class="muted">–</span>` },
  ],
  menu: (r, ctx) => [
    { icon: "invoice", label: "Rechnung schreiben", action: () => ctx.navigate(`#/rechnungen/neu?kunde=${r.id}`) },
    { icon: "quote", label: "Angebot schreiben", action: () => ctx.navigate(`#/angebote/neu?kunde=${r.id}`) },
  ],
  form: (r) => html`
    <div style="display:flex;flex-direction:column;gap:14px">
      <label class="field"><span>Name / Firma *</span><input class="input" name="name" value="${r.name || ""}" required autofocus></label>
      <label class="field"><span>Ansprechpartner</span><input class="input" name="contact" value="${r.contact || ""}" placeholder="z. B. Frau Anna Schmitz"></label>
      <label class="field"><span>Anschrift</span><textarea class="textarea" name="address" rows="3" placeholder="Straße Nr.&#10;PLZ Ort">${r.address || ""}</textarea></label>
      <div class="grid-2">
        <label class="field"><span>E-Mail</span><input class="input" type="email" name="email" value="${r.email || ""}"></label>
        <label class="field"><span>USt-IdNr. <span class="hint">(optional)</span></span><input class="input" name="vat_id" value="${r.vat_id || ""}" placeholder="DE123456789"></label>
      </div>
    </div>`,
});
