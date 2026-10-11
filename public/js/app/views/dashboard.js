import { api } from "../api.js";
import { html, ic, eur, eurShort, date, monthName, statusBadge, loading } from "../ui.js";

function chart(series, W) {
  const H = 220, padL = 52, padB = 26, padT = 22;
  const max = Math.max(...series.map((s) => s.total), 1);
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const plotH = H - padB - padT;
  const slot = (W - padL) / series.length;
  const barW = Math.min(44, slot * 0.5);
  const y = (v) => padT + plotH - (v / top) * plotH;
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  const lastIdx = series.length - 1;

  return html`
    <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Umsatz der letzten 6 Monate">
      ${ticks.map((v) => html`
        <line class="grid-line" x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}"></line>
        <text class="axis-label" x="${padL - 10}" y="${y(v) + 4}" text-anchor="end">${eurShort(v)}</text>`)}
      ${series.map((s, i) => {
        const x = padL + slot * i + (slot - barW) / 2;
        const h = Math.max(s.total > 0 ? 4 : 0, (s.total / top) * plotH);
        const r = Math.min(4, h);
        const by = padT + plotH - h;
        const d = h ? `M${x},${padT + plotH} V${by + r} Q${x},${by} ${x + r},${by} H${x + barW - r} Q${x + barW},${by} ${x + barW},${by + r} V${padT + plotH} Z` : "";
        return html`
          ${d ? html`<path class="bar" data-i="${i}" d="${d}"></path>` : ""}
          ${i === lastIdx && s.total > 0 ? html`<text class="val-label" x="${x + barW / 2}" y="${by - 7}" text-anchor="middle">${eurShort(s.total)}</text>` : ""}
          <text class="axis-label" x="${x + barW / 2}" y="${H - 6}" text-anchor="middle">${monthName(s.month)}</text>
          <rect class="bar-hit" data-i="${i}" x="${padL + slot * i}" y="${padT}" width="${slot}" height="${plotH}"></rect>`;
      })}
    </svg>
    <div class="tooltip" hidden></div>`;
}

function niceStep(raw) {
  if (raw <= 0) return 250;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
}

function bindChart(el, series) {
  const tip = el.querySelector(".tooltip");
  el.querySelectorAll(".bar-hit").forEach((hit) => {
    hit.addEventListener("pointerenter", () => {
      const i = Number(hit.dataset.i);
      el.querySelector(`.bar[data-i="${i}"]`)?.classList.add("hover");
      const box = el.getBoundingClientRect();
      const r = hit.getBoundingClientRect();
      tip.innerHTML = String(html`${new Date(series[i].month + "-01T00:00:00").toLocaleDateString("de-DE", { month: "long", year: "numeric" })}<strong>${eur(series[i].total)}</strong>`);
      tip.style.left = r.left - box.left + r.width / 2 + "px";
      tip.style.top = "8px";
      tip.hidden = false;
    });
    hit.addEventListener("pointerleave", () => {
      el.querySelectorAll(".bar.hover").forEach((b) => b.classList.remove("hover"));
      tip.hidden = true;
    });
  });
}

export default async function dashboard(root, ctx, _params, stale) {
  root.innerHTML = String(loading());
  const stats = await api("/stats");
  if (stale()) return;
  const me = ctx.me;
  const s = me.settings;
  const hour = new Date().getHours();
  const greet = hour < 11 ? "Guten Morgen" : hour < 18 ? "Hallo" : "Guten Abend";

  const steps = [
    ["Firmendaten & Bankverbindung eintragen", "#/einstellungen", Boolean(s.name && s.address && s.iban)],
    ["Ersten Kunden anlegen", "#/kunden", me.usage.customers > 0],
    ["Produkt oder Leistung speichern", "#/produkte", me.usage.products > 0],
    ["Erste Rechnung schreiben", "#/rechnungen/neu", me.usage.documents > 0],
  ];
  const done = steps.filter((x) => x[2]).length;
  const trialDays = me.trialEndsAt ? Math.max(1, Math.ceil((me.trialEndsAt - Date.now()) / 864e5)) : 0;

  root.innerHTML = String(html`
    <div class="page stack">
      <div class="page-head" style="margin-bottom:0">
        <div><h1>${greet}</h1><p>Hier ist der Überblick über deine Finanzen.</p></div>
        <div class="page-actions">
          <a class="btn btn-secondary" href="#/angebote/neu">${ic("quote")}Neues Angebot</a>
          <a class="btn btn-primary" href="#/rechnungen/neu">${ic("plus")}Neue Rechnung</a>
        </div>
      </div>

      ${trialDays ? html`
        <div class="banner">
          <div class="doc-icon" style="background:var(--surface);color:var(--primary-text)">${ic("sparkles")}</div>
          <div class="grow"><strong>Du testest Pro – noch ${trialDays} ${trialDays === 1 ? "Tag" : "Tage"} kostenlos</strong>
            <p>Danach geht es automatisch im Starter-Plan weiter. Keine Kosten, keine Kündigung nötig.</p></div>
          <a class="btn btn-primary btn-sm" href="#/abo">Pro behalten</a>
        </div>` : ""}

      <div class="kpis">
        <div class="card kpi"><div class="label">${ic("trending")}Umsatz ${new Date().toLocaleDateString("de-DE", { month: "long" })}</div><div class="value num">${eur(stats.invoicedThisMonth)}</div><div class="sub">in Rechnung gestellt</div></div>
        <div class="card kpi"><div class="label">${ic("banknote")}Eingegangen</div><div class="value num">${eur(stats.paidThisMonth)}</div><div class="sub">diesen Monat bezahlt</div></div>
        <div class="card kpi"><div class="label">${ic("clock")}Offen</div><div class="value num">${eur(stats.open.total)}</div><div class="sub">${stats.open.count} ${stats.open.count === 1 ? "Rechnung" : "Rechnungen"}</div></div>
        <div class="card kpi"><div class="label">${ic("alert")}Überfällig</div><div class="value num ${stats.overdue.count ? "danger" : ""}">${eur(stats.overdue.total)}</div><div class="sub">${stats.overdue.count ? `${stats.overdue.count} – jetzt erinnern` : "alles im grünen Bereich"}</div></div>
      </div>

      <div class="dash-grid">
        <div class="card">
          <div class="card-header"><h2>Umsatz der letzten 6 Monate</h2><span class="muted" style="font-size:13px">ohne stornierte Rechnungen</span></div>
          <div class="card-body"><div class="chart" id="chart"></div></div>
        </div>
        ${done < steps.length ? html`
          <div class="card">
            <div class="card-header"><h2>Los geht's</h2><span class="muted" style="font-size:13px">${done} von ${steps.length} erledigt</span></div>
            <div style="padding:14px 20px 4px"><div class="meter"><div style="width:${(done / steps.length) * 100}%"></div></div></div>
            <div class="steps">
              ${steps.map(([label, href, ok]) => html`<a class="step ${ok ? "done" : ""}" href="${href}"><span class="dot">${ok ? ic("check") : ""}</span><span class="grow">${label}</span>${ok ? "" : ic("arrow")}</a>`)}
            </div>
          </div>` : html`
          <div class="card">
            <div class="card-header"><h2>Offene Angebote</h2><a href="#/angebote" style="font-size:13px">Alle ansehen</a></div>
            <div class="card-body">
              <div class="value num" style="font-size:28px;font-weight:700;letter-spacing:-.03em">${eur(stats.openQuotes.total)}</div>
              <p class="muted" style="margin-top:4px">${stats.openQuotes.count} ${stats.openQuotes.count === 1 ? "Angebot wartet" : "Angebote warten"} auf eine Antwort.</p>
            </div>
          </div>`}
      </div>

      <div class="card">
        <div class="card-header"><h2>Zuletzt erstellt</h2><a href="#/rechnungen" style="font-size:13px">Alle Rechnungen</a></div>
        ${stats.recent.length
          ? stats.recent.map((d) => html`
            <a class="list-item" href="#/beleg/${d.id}">
              <div class="doc-icon">${ic(d.type === "invoice" ? "invoice" : "quote")}</div>
              <div class="grow"><div class="title">${d.customer_name}</div><div class="sub">${d.type === "invoice" ? "Rechnung" : "Angebot"} ${d.number} · ${date(d.date)}</div></div>
              <div style="text-align:right"><div class="num" style="font-weight:600">${eur(d.total)}</div>${statusBadge(d.display_status)}</div>
            </a>`)
          : html`<div class="card-body muted">Noch keine Belege. <a href="#/rechnungen/neu">Schreib deine erste Rechnung</a> – dauert keine Minute.</div>`}
      </div>
    </div>`);

  const el = root.querySelector("#chart");
  const draw = () => {
    el.innerHTML = String(chart(stats.series, Math.max(280, el.clientWidth)));
    bindChart(el, stats.series);
  };
  draw();
  const ro = new ResizeObserver(() => draw());
  ro.observe(el);
  return () => ro.disconnect();
}
