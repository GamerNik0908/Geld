import { api } from "../api.js";
import { html, ic, eur, date, statusBadge, emptyState, loading, popMenu } from "../ui.js";
import { documentActions } from "./doc-actions.js";

const FILTERS = {
  invoice: [["all", "Alle"], ["open", "Offen"], ["overdue", "Überfällig"], ["paid", "Bezahlt"], ["cancelled", "Storniert"]],
  quote: [["all", "Alle"], ["open", "Offen"], ["accepted", "Angenommen"], ["declined", "Abgelehnt"], ["expired", "Abgelaufen"]],
};

export default async function documents(root, ctx, { type }, stale) {
  const isInvoice = type === "invoice";
  const noun = isInvoice ? "Rechnung" : "Angebot";
  const base = isInvoice ? "#/rechnungen" : "#/angebote";
  root.innerHTML = String(loading());
  let rows = await api(`/documents?type=${type}`);
  if (stale()) return;
  let filter = "all";
  let query = "";

  const shell = () => html`
    <div class="page">
      <div class="page-head">
        <div><h1>${isInvoice ? "Rechnungen" : "Angebote"}</h1>
          <p>${isInvoice ? "Alle Rechnungen auf einen Blick – offene, bezahlte und überfällige." : "Erstelle Angebote und wandle sie mit einem Klick in Rechnungen um."}</p></div>
        <div class="page-actions">
          ${isInvoice ? html`<button class="btn btn-secondary" id="csvBtn">${ic("download")}CSV-Export ${ctx.isPro() ? "" : html`<span class="pro-pill">PRO</span>`}</button>` : ""}
          <a class="btn btn-primary" href="${base}/neu">${ic("plus")}${isInvoice ? "Neue Rechnung" : "Neues Angebot"}</a>
        </div>
      </div>
      <div class="card" id="listCard"></div>
    </div>`;

  function renderList() {
    const card = root.querySelector("#listCard");
    if (!rows.length) {
      card.innerHTML = String(emptyState({
        iconName: isInvoice ? "invoice" : "quote",
        title: isInvoice ? "Noch keine Rechnungen" : "Noch keine Angebote",
        text: isInvoice
          ? "Erstelle deine erste Rechnung – mit Kunde, Positionen und PDF in unter einer Minute."
          : "Schick deinen Kunden ein professionelles Angebot und mach daraus später per Klick eine Rechnung.",
        action: html`<a class="btn btn-primary" href="${base}/neu">${ic("plus")}${isInvoice ? "Erste Rechnung erstellen" : "Erstes Angebot erstellen"}</a>`,
      }));
      return;
    }
    const counts = Object.fromEntries(FILTERS[type].map(([k]) => [k, k === "all" ? rows.length : rows.filter((r) => r.display_status === k).length]));
    const q = query.toLowerCase();
    const shown = rows.filter((r) => (filter === "all" || r.display_status === filter) && (!q || `${r.number} ${r.customer_name}`.toLowerCase().includes(q)));
    const sum = shown.reduce((s, r) => s + r.total, 0);

    card.innerHTML = String(html`
      <div class="toolbar">
        <div class="tabs" role="tablist">
          ${FILTERS[type].map(([k, label]) => html`<button class="tab ${filter === k ? "active" : ""}" data-filter="${k}">${label}<span class="n">${counts[k]}</span></button>`)}
        </div>
        <div class="input-group" style="width:min(100%,280px)">${ic("search")}<input class="input" id="search" placeholder="Nummer oder Kunde suchen" value="${query}"></div>
      </div>
      ${shown.length ? html`
        <table class="table responsive">
          <thead><tr><th>Nummer</th><th>Kunde</th><th>Datum</th><th>${isInvoice ? "Fällig" : "Gültig bis"}</th><th>Status</th><th class="r">Betrag</th><th></th></tr></thead>
          <tbody>
            ${shown.map((r) => html`
              <tr class="clickable" data-id="${r.id}">
                <td class="strong">${r.number}</td>
                <td class="r-m">${r.customer_name}</td>
                <td class="hide-m num">${date(r.date)}</td>
                <td class="hide-m num">${date(r.due_date)}</td>
                <td>${statusBadge(r.display_status)}</td>
                <td class="r strong num">${eur(r.total)}</td>
                <td class="r"><button class="btn btn-ghost btn-icon btn-sm" data-menu="${r.id}" aria-label="Aktionen">${ic("more")}</button></td>
              </tr>`)}
          </tbody>
        </table>
        <div class="toolbar" style="border-top:1px solid var(--border);border-bottom:0;justify-content:flex-end;font-size:14px">
          <span class="muted">${shown.length} ${shown.length === 1 ? noun : isInvoice ? "Rechnungen" : "Angebote"} · Summe</span><strong class="num">${eur(sum)}</strong>
        </div>`
      : html`<div class="empty"><p>Keine Treffer für diese Auswahl.</p></div>`}`);

    const search = card.querySelector("#search");
    search?.addEventListener("input", () => {
      query = search.value;
      const pos = search.selectionStart;
      renderList();
      const again = root.querySelector("#search");
      again.focus();
      again.setSelectionRange(pos, pos);
    });
  }

  root.innerHTML = String(shell());
  renderList();

  async function reload() {
    rows = await api(`/documents?type=${type}`);
    renderList();
    ctx.refreshMe();
  }

  root.addEventListener("click", async (e) => {
    const tab = e.target.closest("[data-filter]");
    if (tab) { filter = tab.dataset.filter; renderList(); return; }
    const menuBtn = e.target.closest("[data-menu]");
    if (menuBtn) {
      e.stopPropagation();
      const row = rows.find((r) => r.id === Number(menuBtn.dataset.menu));
      popMenu(menuBtn, documentActions(row, ctx, { onChange: reload, onCreated: (d) => ctx.navigate(`#/beleg/${d.id}`) }));
      return;
    }
    const tr = e.target.closest("tr[data-id]");
    if (tr) ctx.navigate(`#/beleg/${tr.dataset.id}`);
  });

  root.querySelector("#csvBtn")?.addEventListener("click", () => {
    if (!ctx.isPro()) return ctx.upgradePrompt("Der CSV-Export für deine Buchhaltung oder Steuerberatung ist in Pro enthalten.");
    location.href = "/api/export.csv";
  });
}

