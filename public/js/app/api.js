export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function api(path, method = "GET", body) {
  const res = await fetch("/api" + path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  if (res.status === 401 && !path.startsWith("/login")) {
    location.href = "/login?next=" + encodeURIComponent(location.pathname + location.hash);
    throw new ApiError("Bitte melde dich an.", 401);
  }
  if (!res.ok) throw new ApiError(data?.error || "Da ist etwas schiefgelaufen.", res.status);
  return data;
}
