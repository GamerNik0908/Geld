// Gewähltes Farbschema vor dem ersten Rendern setzen (verhindert Flackern)
try { const t = localStorage.getItem("theme"); if (t) document.documentElement.dataset.theme = t; } catch {}
