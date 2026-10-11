import { icon } from "../icons.js";

// ---------- HTML-Templates mit automatischem Escaping ----------
class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s));
export const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
const fmt = (v) => (v == null || v === false ? "" : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(fmt).join("") : esc(v));
export function html(strings, ...vals) {
  return raw(strings.reduce((out, s, i) => out + s + (i < vals.length ? fmt(vals[i]) : ""), ""));
}
export const ic = (name, cls) => raw(icon(name, cls));

// ---------- Formatierung ----------
export const eur = (n) => (Number(n) || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
export const eurShort = (n) => (Number(n) || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
export const num = (n) => (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: 3 });
export const date = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("de-DE") : "–");
export const today = () => new Date().toISOString().slice(0, 10);
export const addDays = (iso, d) => new Date(new Date(iso + "T00:00:00Z").getTime() + d * 864e5).toISOString().slice(0, 10);
export const monthName = (key) => new Date(key + "-01T00:00:00").toLocaleDateString("de-DE", { month: "short" }).replace(".", "");

export const STATUS = {
  open: ["Offen", "info"],
  paid: ["Bezahlt", "success"],
  overdue: ["Überfällig", "danger"],
  cancelled: ["Storniert", ""],
  accepted: ["Angenommen", "success"],
  declined: ["Abgelehnt", ""],
  expired: ["Abgelaufen", "warning"],
};
export const statusBadge = (s) => html`<span class="badge ${STATUS[s]?.[1] ? "badge-" + STATUS[s][1] : ""}">${STATUS[s]?.[0] || s}</span>`;

// ---------- Toasts ----------
let toastBox;
export function toast(message, type = "success") {
  toastBox ??= document.body.appendChild(Object.assign(document.createElement("div"), { className: "toasts", role: "status" }));
  const el = document.createElement("div");
  el.className = "toast" + (type === "error" ? " error" : "");
  el.innerHTML = String(html`${ic(type === "error" ? "alert" : "checkCircle")}<span>${message}</span>`);
  toastBox.append(el);
  while (toastBox.children.length > 3) toastBox.firstChild.remove();
  setTimeout(() => el.remove(), type === "error" ? 6000 : 3500);
}

// ---------- Dialoge ----------
export function modal({ title, body, actions = [], wide = false, onOpen }) {
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "modal";
    if (wide) dlg.style.width = "min(760px, calc(100vw - 32px))";
    dlg.innerHTML = String(html`
      <form method="dialog" novalidate>
        <div class="modal-head"><h3>${title}</h3><button class="btn btn-ghost btn-icon btn-sm" value="" aria-label="Schließen">${ic("x")}</button></div>
        <div class="modal-body">${body}</div>
        ${actions.length ? html`<div class="modal-foot">${actions.map((a) => html`<button class="btn ${a.cls || "btn-secondary"}" value="${a.value}">${a.label}</button>`)}</div>` : ""}
      </form>`);
    document.body.append(dlg);
    const form = dlg.querySelector("form");
    form.addEventListener("submit", (e) => {
      const value = e.submitter?.value ?? "";
      const required = [...form.querySelectorAll("[required]")].find((el) => !el.value.trim());
      if (value && value !== "cancel" && required) { e.preventDefault(); required.focus(); return; }
      resolve({ value, data: Object.fromEntries(new FormData(form)), form });
    });
    dlg.addEventListener("close", () => { setTimeout(() => dlg.remove(), 200); resolve({ value: "" }); });
    dlg.showModal();
    onOpen?.(dlg, () => dlg.close());
  });
}

export async function confirmDialog(title, text, { label = "Bestätigen", danger = false } = {}) {
  const { value } = await modal({
    title,
    body: html`<p class="muted">${text}</p>`,
    actions: [{ label: "Abbrechen", value: "cancel" }, { label, value: "ok", cls: danger ? "btn-danger" : "btn-primary" }],
  });
  return value === "ok";
}

// ---------- Aufklappmenü ----------
export function popMenu(anchor, items) {
  document.querySelector(".menu")?.remove();
  const menu = document.createElement("div");
  menu.className = "menu";
  menu.innerHTML = items.map((it, i) => (it === "-" ? "<hr>" : String(html`<button data-i="${i}" class="${it.danger ? "danger" : ""}">${ic(it.icon)}${it.label}${it.pro ? html` <span class="pro-pill" style="margin-left:auto">PRO</span>` : ""}</button>`))).join("");
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  const left = Math.min(r.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8);
  const below = r.bottom + 6 + menu.offsetHeight < window.innerHeight;
  menu.style.left = Math.max(8, left + scrollX) + "px";
  menu.style.top = (below ? r.bottom + 6 : r.top - menu.offsetHeight - 6) + scrollY + "px";
  const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener("pointerdown", close, true); } };
  setTimeout(() => document.addEventListener("pointerdown", close, true));
  menu.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    menu.remove();
    document.removeEventListener("pointerdown", close, true);
    items[b.dataset.i].action();
  });
}

export const emptyState = ({ iconName, title, text, action }) => html`
  <div class="empty"><div class="empty-icon">${ic(iconName)}</div><h3>${title}</h3><p>${text}</p>${action || ""}</div>`;

export const loading = () => html`<div class="loading"><div class="spinner"></div></div>`;

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function hashQuery() {
  return new URLSearchParams(location.hash.split("?")[1] || "");
}
