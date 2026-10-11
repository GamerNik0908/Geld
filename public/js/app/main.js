import { api } from "./api.js";
import { html, ic, raw, toast, modal } from "./ui.js";
import { brandMark } from "../icons.js";
import dashboard from "./views/dashboard.js";
import documents from "./views/documents.js";
import editor from "./views/editor.js";
import customers from "./views/customers.js";
import products from "./views/products.js";
import settings from "./views/settings.js";
import billing from "./views/billing.js";

const ROUTES = [
  [/^\/?$/, dashboard, () => ({})],
  [/^\/rechnungen$/, documents, () => ({ type: "invoice" })],
  [/^\/angebote$/, documents, () => ({ type: "quote" })],
  [/^\/rechnungen\/neu$/, editor, () => ({ type: "invoice" })],
  [/^\/angebote\/neu$/, editor, () => ({ type: "quote" })],
  [/^\/beleg\/(\d+)$/, editor, (m) => ({ id: Number(m[1]) })],
  [/^\/kunden$/, customers, () => ({})],
  [/^\/produkte$/, products, () => ({})],
  [/^\/einstellungen$/, settings, () => ({})],
  [/^\/abo$/, billing, () => ({})],
];

const NAV = [
  ["Übersicht", "#/", "dashboard", /^\/?$/],
  ["Rechnungen", "#/rechnungen", "invoice", /^\/rechnungen/],
  ["Angebote", "#/angebote", "quote", /^\/angebote/],
  ["Kunden", "#/kunden", "users", /^\/kunden/],
  ["Produkte & Leistungen", "#/produkte", "package", /^\/produkte/],
];

const ctx = {
  me: null,
  async refreshMe() {
    ctx.me = await api("/me");
    renderChrome();
    return ctx.me;
  },
  isPro: () => ctx.me.plan === "pro",
  navigate: (hash) => { location.hash = hash; },
  reload: () => route(),
  // Zeigt bei Limits/Pro-Funktionen einen Upgrade-Dialog statt einer nackten Fehlermeldung
  async handleError(err) {
    if (err.status === 402 || err.status === 403) return ctx.upgradePrompt(err.message);
    toast(err.message, "error");
  },
  async upgradePrompt(message) {
    const { value } = await modal({
      title: "Upgrade auf Pro",
      body: html`
        <div style="display:flex;flex-direction:column;gap:14px">
          <p>${message}</p>
          <ul class="feature-list">
            ${["Unbegrenzt Rechnungen, Angebote, Kunden & Produkte", "GiroCode: Kunden zahlen per QR-Scan", "Eigenes Logo & Markenfarbe, kein Wasserzeichen", "Zahlungserinnerungen & CSV-Export"].map((f) => html`<li>${ic("check")}${f}</li>`)}
          </ul>
          <p class="muted">Ab ${(ctx.me.prices.yearly / 12).toLocaleString("de-DE", { style: "currency", currency: "EUR" })} pro Monat · jederzeit kündbar</p>
        </div>`,
      actions: [{ label: "Später", value: "cancel" }, { label: "Pro ansehen", value: "go", cls: "btn-primary" }],
    });
    if (value === "go") ctx.navigate("#/abo");
  },
};

function currentPath() {
  return location.hash.replace(/^#/, "").split("?")[0] || "/";
}

function renderChrome() {
  const me = ctx.me;
  const path = currentPath();
  const pro = me.plan === "pro";
  const trialDays = me.trialEndsAt ? Math.max(1, Math.ceil((me.trialEndsAt - Date.now()) / 864e5)) : 0;
  const lim = me.limits.docsPerMonth;
  const theme = document.documentElement.dataset.theme;

  document.getElementById("sidebar").innerHTML = String(html`
    <a class="brand" href="#/">${raw(brandMark)}Rechnungsblitz</a>
    <a class="btn btn-primary" href="#/rechnungen/neu" style="margin-bottom:12px">${ic("plus")}Neue Rechnung</a>
    ${NAV.map(([label, href, iconName, re]) => html`<a class="nav-link ${re.test(path) ? "active" : ""}" href="${href}">${ic(iconName)}${label}</a>`)}
    <div class="nav-label">Konto</div>
    <a class="nav-link ${path === "/einstellungen" ? "active" : ""}" href="#/einstellungen">${ic("settings")}Einstellungen</a>
    <a class="nav-link ${path === "/abo" ? "active" : ""}" href="#/abo">${ic("card")}Abo & Plan ${!me.subscribed ? html`<span class="pro-pill" style="margin-left:auto">PRO</span>` : ""}</a>
    <div class="sidebar-foot">
      ${me.subscribed ? "" : html`
        <div class="plan-card">
          <strong>${trialDays ? `Pro-Test: noch ${trialDays} ${trialDays === 1 ? "Tag" : "Tage"}` : "Starter-Plan"}</strong>
          ${trialDays
            ? html`<span class="muted">Alle Pro-Funktionen freigeschaltet.</span>`
            : html`<span class="muted">${me.usage.docsThisMonth} von ${lim} Belegen diesen Monat</span>
                <div class="meter ${me.usage.docsThisMonth >= lim ? "full" : ""}"><div style="width:${Math.min(100, (me.usage.docsThisMonth / lim) * 100)}%"></div></div>`}
          <a class="btn btn-secondary btn-sm" href="#/abo" style="width:100%;margin-top:${trialDays ? 10 : 0}px">${ic("sparkles")}Pro holen</a>
        </div>`}
      <div class="user-chip">
        <div class="avatar">${me.email[0].toUpperCase()}</div>
        <span class="email" title="${me.email}">${me.email}</span>
        <button class="btn btn-ghost btn-icon btn-sm" id="themeBtn" title="Hell/Dunkel umschalten">${ic(theme === "dark" || (!theme && matchMedia("(prefers-color-scheme: dark)").matches) ? "sun" : "moon")}</button>
        <button class="btn btn-ghost btn-icon btn-sm" id="logoutBtn" title="Abmelden">${ic("logout")}</button>
      </div>
    </div>`);

  document.getElementById("topbar").innerHTML = String(html`
    <button class="btn btn-ghost btn-icon" id="menuBtn" aria-label="Menü">${ic("menu")}</button>
    <a class="brand" href="#/">${raw(brandMark)}Rechnungsblitz</a>
    <a class="btn btn-primary btn-icon" href="#/rechnungen/neu" aria-label="Neue Rechnung">${ic("plus")}</a>`);

  document.getElementById("logoutBtn").onclick = async () => { await api("/logout", "POST", {}); location.href = "/"; };
  document.getElementById("themeBtn").onclick = () => {
    const dark = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("theme", document.documentElement.dataset.theme); } catch {}
    renderChrome();
  };
  document.getElementById("menuBtn").onclick = () => document.getElementById("shell").classList.add("nav-open");
}

let cleanup;
let renderToken = 0;
async function route() {
  const path = currentPath();
  document.getElementById("shell").classList.remove("nav-open");
  const match = ROUTES.map(([re, view, params]) => [re.exec(path), view, params]).find(([m]) => m);
  // Jede Seite bekommt ein frisches Element, damit alte Event-Listener verschwinden
  const view = document.createElement("div");
  document.getElementById("view").replaceChildren(view);
  if (!match) { ctx.navigate("#/"); return; }
  const [m, mod, params] = match;
  cleanup?.();
  cleanup = null;
  const token = ++renderToken;
  try { await ctx.refreshMe(); } catch { return; }
  if (token !== renderToken) return;
  try {
    const result = await mod(view, ctx, params(m), () => token !== renderToken);
    if (token === renderToken) cleanup = result;
    window.scrollTo(0, 0);
  } catch (err) {
    if (err.status !== 401) {
      view.innerHTML = String(html`<div class="page"><div class="alert alert-danger">${ic("alert")}${err.message}</div></div>`);
    }
  }
}

document.getElementById("scrim").onclick = () => document.getElementById("shell").classList.remove("nav-open");
window.addEventListener("hashchange", route);

route();
