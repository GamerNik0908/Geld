import { brandMark, hydrateIcons } from "./icons.js";

document.documentElement.classList.add("js");
document.querySelectorAll("[data-brand]").forEach((el) => { el.innerHTML = brandMark + "Rechnungsblitz"; });
hydrateIcons();
document.getElementById("year").textContent = new Date().getFullYear();

const nav = document.getElementById("nav");
const onScroll = () => nav.classList.toggle("scrolled", scrollY > 8);
addEventListener("scroll", onScroll, { passive: true });
onScroll();

// Sanftes Einblenden beim Scrollen
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
}, { rootMargin: "0px 0px -60px 0px" });
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

// Preise aus der App laden (eine Quelle für Landingpage und App)
const eur = (n) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: n % 1 ? 2 : 0 });
let prices = { monthly: 6.99, yearly: 59 };
function renderPrice(interval) {
  document.querySelectorAll("#intervalToggle button").forEach((b) => b.classList.toggle("active", b.dataset.interval === interval));
  const monthly = interval === "year" ? prices.yearly / 12 : prices.monthly;
  document.getElementById("proPrice").innerHTML = `${monthly.toLocaleString("de-DE", { style: "currency", currency: "EUR" })} <small>/ Monat</small>`;
  document.getElementById("proBilled").textContent = interval === "year" ? `${eur(prices.yearly)} jährlich abgerechnet` : "monatlich abgerechnet, monatlich kündbar";
}
document.getElementById("intervalToggle").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) renderPrice(b.dataset.interval);
});
fetch("/api/prices").then((r) => r.json()).then((p) => { prices = p; renderPrice(document.querySelector("#intervalToggle .active").dataset.interval); }).catch(() => {});

// Eingeloggte Besucher direkt zur App
fetch("/api/me").then((r) => {
  if (r.ok) {
    const link = document.getElementById("loginLink");
    link.textContent = "Zur App";
    link.href = "/app";
  }
}).catch(() => {});
