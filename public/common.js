async function api(path, method = "GET", body) {
  const res = await fetch("/api" + path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  if (!res.ok) throw Object.assign(new Error(data?.error || "Fehler"), { status: res.status });
  return data;
}
const $ = (id) => document.getElementById(id);
const eur = (n) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
function showMsg(el, text, type = "err") {
  el.className = "msg " + type;
  el.textContent = text;
  el.hidden = !text;
}
