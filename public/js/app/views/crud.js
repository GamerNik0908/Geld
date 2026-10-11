import { api } from "../api.js";
import { html, ic, emptyState, loading, modal, toast, confirmDialog, popMenu } from "../ui.js";

// Gemeinsame Listen-/Formularlogik für Kunden und Produkte
export function crudView(cfg) {
  return async function view(root, ctx, _params, stale) {
    root.innerHTML = String(loading());
    let rows = await api(cfg.endpoint);
    if (stale()) return;
    let query = "";

    function render() {
      const q = query.toLowerCase();
      const shown = rows.filter((r) => !q || cfg.searchText(r).toLowerCase().includes(q));
      const max = ctx.me.limits[cfg.limitKey];
      root.innerHTML = String(html`
        <div class="page">
          <div class="page-head">
            <div><h1>${cfg.title}</h1><p>${cfg.subtitle}</p></div>
            <div class="page-actions"><button class="btn btn-primary" id="addBtn">${ic("plus")}${cfg.addLabel}</button></div>
          </div>
          ${max ? html`<p class="hint" style="margin:-12px 0 16px">${rows.length} von ${max} im Starter-Plan · <a href="#/abo">unbegrenzt mit Pro</a></p>` : ""}
          <div class="card">
            ${rows.length ? html`
              <div class="toolbar"><div class="input-group" style="width:min(100%,320px)">${ic("search")}<input class="input" id="search" placeholder="Suchen…" value="${query}"></div><span class="muted" style="font-size:13px">${rows.length} Einträge</span></div>
              ${shown.length ? html`
                <table class="table responsive">
                  <thead><tr>${cfg.columns.map((c) => html`<th class="${c.cls || ""}">${c.label}</th>`)}<th></th></tr></thead>
                  <tbody>${shown.map((r) => html`<tr class="clickable" data-id="${r.id}">${cfg.columns.map((c) => html`<td class="${c.cls || ""}">${c.cell(r)}</td>`)}<td class="r"><button class="btn btn-ghost btn-icon btn-sm" data-menu="${r.id}" aria-label="Aktionen">${ic("more")}</button></td></tr>`)}</tbody>
                </table>` : html`<div class="empty"><p>Keine Treffer.</p></div>`}`
            : emptyState({ ...cfg.empty, action: html`<button class="btn btn-primary" id="addBtn2">${ic("plus")}${cfg.addLabel}</button>` })}
          </div>
        </div>`);
      const search = root.querySelector("#search");
      search?.addEventListener("input", () => {
        query = search.value;
        const pos = search.selectionStart;
        render();
        const s = root.querySelector("#search");
        s.focus();
        s.setSelectionRange(pos, pos);
      });
    }

    async function edit(row) {
      const { value, data } = await modal({
        title: row ? cfg.editTitle : cfg.addLabel,
        body: cfg.form(row || {}, ctx),
        actions: [{ label: "Abbrechen", value: "cancel" }, { label: row ? "Speichern" : "Anlegen", value: "save", cls: "btn-primary" }],
      });
      if (value !== "save") return;
      try {
        const saved = row ? await api(`${cfg.endpoint}/${row.id}`, "PUT", data) : await api(cfg.endpoint, "POST", data);
        rows = row ? rows.map((r) => (r.id === saved.id ? saved : r)) : [...rows, saved];
        rows.sort((a, b) => a.name.localeCompare(b.name, "de"));
        await ctx.refreshMe();
        render();
        toast(row ? "Gespeichert" : `„${saved.name}“ angelegt`);
      } catch (err) {
        ctx.handleError(err);
      }
    }

    async function remove(row) {
      if (!(await confirmDialog(`„${row.name}“ löschen?`, cfg.deleteText, { label: "Löschen", danger: true }))) return;
      await api(`${cfg.endpoint}/${row.id}`, "DELETE");
      rows = rows.filter((r) => r.id !== row.id);
      await ctx.refreshMe();
      render();
      toast("Gelöscht");
    }

    render();
    root.addEventListener("click", (e) => {
      if (e.target.closest("#addBtn, #addBtn2")) return edit(null);
      const menu = e.target.closest("[data-menu]");
      if (menu) {
        e.stopPropagation();
        const row = rows.find((r) => r.id === Number(menu.dataset.menu));
        return popMenu(menu, [...cfg.menu(row, ctx), { icon: "edit", label: "Bearbeiten", action: () => edit(row) }, "-", { icon: "trash", label: "Löschen", danger: true, action: () => remove(row) }]);
      }
      const tr = e.target.closest("tr[data-id]");
      if (tr) edit(rows.find((r) => r.id === Number(tr.dataset.id)));
    });
  };
}
