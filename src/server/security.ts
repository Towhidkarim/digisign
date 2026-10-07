const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Blocks cross-site writes. Browsers send `Origin` on every POST and PUT. A missing header is allowed
 * only for non-browser clients that also send no `Sec-Fetch-Site: cross-site` hint.
 */
export function crossSiteRejection(
  request: Request,
  allowedOrigin: string,
): Response | null {
  if (SAFE_METHODS.has(request.method)) return null;
  const origin = request.headers.get('origin');
  const own = new URL(request.url).origin;
  if (origin) {
    if (origin === own || origin === allowedOrigin) return null;
    return reject();
  }
  if (request.headers.get('sec-fetch-site') === 'cross-site') return reject();
  return null;
}

function reject(): Response {
  return Response.json(
    { error: 'This request came from another site.' },
    { status: 403 },
  );
}

/** CSP that keeps the app, the pdf.js worker, blob previews, and inline hydration scripts working. */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function withSecurityHeaders(
  response: Response,
  request: Request,
): Response {
  const secure = new URL(request.url).protocol === 'https:';
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('x-frame-options', 'DENY');
  if (secure) {
    headers.set(
      'strict-transport-security',
      'max-age=31536000; includeSubDomains',
    );
    // Vite dev injects inline and eval scripts, so the CSP applies on https only.
    headers.set('content-security-policy', CSP);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
