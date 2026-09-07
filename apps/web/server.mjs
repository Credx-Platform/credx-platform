import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('./dist', import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const apiProxyTarget = (process.env.API_PROXY_TARGET ?? 'https://credxapi-production.up.railway.app').replace(/\/+$/, '');
// Matches the Vercel-era behavior where apex 307'd to www. Set to '' to disable.
const canonicalHost = process.env.CANONICAL_HOST ?? 'www.credxme.com';
const redirectHosts = new Set(
  (process.env.REDIRECT_HOSTS ?? 'credxme.com').split(',').map((h) => h.trim()).filter(Boolean)
);
const turnstileSiteKey = (
  process.env.TURNSTILE_SITE_KEY ??
  process.env.CLOUDFLARE_TURNSTILE_SITE_KEY ??
  ''
).trim();

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

const securityHeaders = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload'
};

const staticPageRoutes = new Map([
  ['/product', 'product.html'],
  ['/start', 'start.html'],
  ['/signup', 'signup.html'],
  ['/contract', 'signup.html'],
  ['/affiliate-onboarding', 'portal.html'],
  ['/portal', 'portal.html'],
  ['/adminportal', 'adminportal.html'],
  ['/masterclass', 'masterclass.html'],
  ['/masterclass-terms', 'masterclass-terms.html'],
  ['/masterclass-checkout', 'masterclass-checkout.html'],
  ['/pricing', 'pricing.html'],
  ['/privacy', 'privacy.html'],
  ['/terms', 'terms.html'],
  ['/croa-disclosure', 'croa-disclosure.html'],
  ['/refund-policy', 'refund-policy.html'],
  ['/cancellation-policy', 'cancellation-policy.html']
]);

const routeRedirects = new Map([
  ['/affiliate', '/affiliate-onboarding'],
  ['/employee', '/adminportal'],
  ['/staff', '/adminportal']
]);

// Prefix routes serve their page for any subpath (client-side routing / promo slugs).
const prefixPageRoutes = [
  ['/start/', 'start.html'],
  ['/product/', 'product.html'],
  ['/signup/', 'signup.html'],
  ['/contract/', 'signup.html'],
  ['/affiliate-onboarding/', 'portal.html'],
  ['/portal/', 'portal.html'],
  ['/adminportal/', 'adminportal.html'],
  ['/masterclass-checkout/', 'masterclass-checkout.html']
];

// Response headers that describe the raw upstream body. fetch() already
// decompressed it, so forwarding these corrupts the response for clients.
const droppedProxyResponseHeaders = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection']);

function safePath(urlPath) {
  const cleaned = normalize(urlPath).replace(/^\.\.(\/|\\|$)+/, '');
  return join(rootDir, cleaned);
}

function serveFile(res, path) {
  const type = contentTypes[extname(path)] ?? 'application/octet-stream';
  const headers = { 'content-type': type, ...securityHeaders };
  if (path.includes(`${join(rootDir, 'assets')}`)) {
    headers['cache-control'] = 'public, max-age=31536000, immutable';
  } else if (extname(path) === '.html') {
    headers['cache-control'] = 'public, max-age=0, must-revalidate';
  }
  res.writeHead(200, headers);
  createReadStream(path).pipe(res);
}

function serveTurnstileConfig(res) {
  const body = `window.CREDX_TURNSTILE_SITE_KEY=${JSON.stringify(turnstileSiteKey)};\n`;
  res.writeHead(200, {
    'content-type': 'application/javascript; charset=utf-8',
    'cache-control': 'public, max-age=0, must-revalidate',
    ...securityHeaders
  });
  res.end(body);
}

async function proxyToApi(req, res) {
  try {
    const targetUrl = `${apiProxyTarget}${req.url ?? '/'}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (key === 'host' || key === 'connection' || key.startsWith('sec-')) continue;
      if (Array.isArray(value)) {
        for (const v of value) headers.append(key, v);
      } else if (value !== undefined) {
        headers.set(key, value);
      }
    }
    headers.set('x-forwarded-host', req.headers.host ?? '');
    headers.set('x-forwarded-proto', 'https');
    if (req.socket.remoteAddress) headers.append('x-forwarded-for', req.socket.remoteAddress);
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : req,
      duplex: 'half',
      redirect: 'manual'
    });
    const responseHeaders = {};
    for (const [key, value] of response.headers.entries()) {
      if (droppedProxyResponseHeaders.has(key) || key === 'set-cookie') continue;
      responseHeaders[key] = value;
    }
    const setCookies = response.headers.getSetCookie?.() ?? [];
    if (setCookies.length > 0) responseHeaders['set-cookie'] = setCookies;
    res.writeHead(response.status, responseHeaders);
    if (response.body) {
      return response.body.pipeTo(new WritableStream({
        write(chunk) {
          res.write(Buffer.from(chunk));
        },
        close() {
          res.end();
        },
        abort(error) {
          res.destroy(error);
        }
      }));
    }
    return res.end();
  } catch (error) {
    console.error('API proxy error:', error?.message ?? error);
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8', ...securityHeaders });
    return res.end(JSON.stringify({ error: 'API proxy failed' }));
  }
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url ?? '/', 'http://localhost');
  const requestPath = requestUrl.pathname;

  const host = (req.headers.host ?? '').split(':')[0].toLowerCase();
  if (canonicalHost && redirectHosts.has(host)) {
    res.writeHead(308, { location: `https://${canonicalHost}${req.url ?? '/'}`, ...securityHeaders });
    return res.end();
  }

  if (requestPath === '/health' || requestPath.startsWith('/api/')) {
    return proxyToApi(req, res);
  }

  if (requestPath === '/turnstile-config.js') {
    return serveTurnstileConfig(res);
  }

  const redirectKey = requestPath.endsWith('/') && requestPath !== '/'
    ? requestPath.slice(0, -1)
    : requestPath;
  const redirectTarget = routeRedirects.get(redirectKey);
  if (redirectTarget) {
    res.writeHead(308, { location: `${redirectTarget}${requestUrl.search}`, ...securityHeaders });
    return res.end();
  }

  if (requestPath === '/' || requestPath === '/index.html') {
    const landingPath = join(rootDir, 'index.html');
    if (existsSync(landingPath)) return serveFile(res, landingPath);
  }

  const routeKey = requestPath.endsWith('/') && requestPath !== '/'
    ? requestPath.slice(0, -1)
    : requestPath;
  const staticPage = staticPageRoutes.get(routeKey);
  if (staticPage) {
    if (routeKey !== requestPath) {
      res.writeHead(308, { location: routeKey, ...securityHeaders });
      return res.end();
    }
    const staticPagePath = join(rootDir, staticPage);
    if (existsSync(staticPagePath)) return serveFile(res, staticPagePath);
  }

  const relativePath = requestPath.replace(/^\//, '');
  const filePath = safePath(relativePath);
  if (existsSync(filePath)) {
    const fileStat = await stat(filePath);
    if (fileStat.isFile()) {
      return serveFile(res, filePath);
    }
  }

  for (const [prefix, page] of prefixPageRoutes) {
    if (requestPath.startsWith(prefix)) {
      const pagePath = join(rootDir, page);
      if (existsSync(pagePath)) return serveFile(res, pagePath);
    }
  }

  const landingPath = join(rootDir, 'index.html');
  if (existsSync(landingPath)) {
    return serveFile(res, landingPath);
  }

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', ...securityHeaders });
  res.end('Not found');
});

server.listen(port, '0.0.0.0', () => {
  console.log(`CredX web listening on port ${port} (proxying /api -> ${apiProxyTarget})`);
});
