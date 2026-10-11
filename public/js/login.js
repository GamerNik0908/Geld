import { brandMark, hydrateIcons } from "./icons.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let register = params.has("neu") || location.hash === "#registrieren";

$("brand").innerHTML = brandMark + "Rechnungsblitz";
hydrateIcons();

function render() {
  $("title").textContent = register ? "Konto erstellen" : "Willkommen zurück";
  $("subtitle").textContent = register ? "14 Tage Pro gratis testen. Keine Kreditkarte nötig." : "Melde dich an, um weiterzuarbeiten.";
  $("submit").textContent = register ? "Kostenlos starten" : "Anmelden";
  $("password").autocomplete = register ? "new-password" : "current-password";
  $("termsRow").hidden = !register;
  $("switch").innerHTML = register ? 'Schon ein Konto? <a href="#" id="toggle">Anmelden</a>' : 'Neu hier? <a href="#" id="toggle">Kostenlos registrieren</a>';
  $("toggle").onclick = (e) => { e.preventDefault(); register = !register; $("msg").hidden = true; render(); };
  document.title = (register ? "Registrieren" : "Anmelden") + " · Rechnungsblitz";
}

$("showPw").onclick = () => {
  const show = $("password").type === "password";
  $("password").type = show ? "text" : "password";
  $("showPw").textContent = show ? "Verbergen" : "Anzeigen";
};

$("form").onsubmit = async (e) => {
  e.preventDefault();
  const fail = (m) => { $("msg").textContent = m; $("msg").hidden = false; };
  if (!$("email").value.includes("@")) return fail("Bitte gib eine gültige E-Mail-Adresse ein.");
  if ($("password").value.length < 8) return fail("Das Passwort muss mindestens 8 Zeichen lang sein.");
  if (register && !$("terms").checked) return fail("Bitte akzeptiere die AGB und die Datenschutzerklärung.");
  $("submit").disabled = true;
  try {
    const res = await fetch(register ? "/api/register" : "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: $("email").value, password: $("password").value }),
    });
    const data = await res.json();
    if (!res.ok) return fail(data.error);
    const next = params.get("next");
    location.href = next && next.startsWith("/app") ? next : "/app";
  } catch {
    fail("Keine Verbindung zum Server.");
  } finally {
    $("submit").disabled = false;
  }
};

render();
