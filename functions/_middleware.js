const BLOCKED_PREFIXES = ["/backend", "/scripts", "/.git", "/.idx", "/.devcontainer"];
const BLOCKED_SUFFIXES = [".md", ".toml", ".nix", ".env", ".example"];

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildSecurityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https://lh3.googleusercontent.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://api.openai.com; frame-ancestors 'none'; base-uri 'self';",
  };
}

function isBlockedPath(pathname) {
  const normalized = normalizeText(pathname || "");
  if (!normalized) return true;
  if (normalized.includes("/..")) return true;
  if (normalized.startsWith("/.") && !normalized.startsWith("/.well-known/")) return true;
  if (BLOCKED_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) {
    return true;
  }
  const lowered = normalized.toLowerCase();
  return BLOCKED_SUFFIXES.some((suffix) => lowered.endsWith(suffix));
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  const securityHeaders = buildSecurityHeaders();
  Object.entries(securityHeaders).forEach(([key, value]) => {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonError(message, status = 404) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...buildSecurityHeaders(),
    },
  });
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);

  if (isBlockedPath(url.pathname)) {
    return jsonError("접근이 허용되지 않은 경로입니다.", 404);
  }

  const response = await next();
  return withSecurityHeaders(response);
}

