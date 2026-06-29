import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('./dist', import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const apiProxyTarget = (process.env.API_PROXY_TARGET ?? 'https://credxapi-production.up.railway.app').replace(/\/+$/, '');

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
  '.ico': 'image/x-icon'
};

const staticPageRoutes = new Map([
  ['/start', 'start.html'],
  ['/signup', 'signup.html'],
  ['/portal', 'portal.html'],
  ['/adminportal', 'adminportal.html'],
  ['/masterclass', 'masterclass.html'],
  ['/masterclass-terms', 'masterclass-terms.html'],
  ['/pricing', 'pricing.html'],
  ['/privacy', 'privacy.html'],
  ['/terms', 'terms.html'],
  ['/croa-disclosure', 'croa-disclosure.html'],
  ['/refund-policy', 'refund-policy.html'],
  ['/cancellation-policy', 'cancellation-policy.html']
]);

function safePath(urlPath) {
  const cleaned = normalize(urlPath).replace(/^\.\.(\/|\\|$)+/, '');
  return join(rootDir, cleaned);
}

function serveFile(res, path) {
  const type = contentTypes[extname(path)] ?? 'application/octet-stream';
  res.writeHead(200, { 'content-type': type });
  createReadStream(path).pipe(res);
}

const server = createServer(async (req, res) => {
  const requestPath = new URL(req.url ?? '/', 'http://localhost').pathname;

  if (requestPath.startsWith('/api/')) {
    try {
      const targetUrl = `${apiProxyTarget}${req.url ?? requestPath}`;
      const headers = new Headers(req.headers);
      headers.delete('host');
      const response = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : req,
        duplex: 'half',
        redirect: 'manual'
      });
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
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
      res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'API proxy failed' }));
    }
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

  if (requestPath.startsWith('/start/')) {
    const startPath = join(rootDir, 'start.html');
    if (existsSync(startPath)) return serveFile(res, startPath);
  }

  if (requestPath.startsWith('/signup/')) {
    const signupPath = join(rootDir, 'signup.html');
    if (existsSync(signupPath)) return serveFile(res, signupPath);
  }

  if (requestPath.startsWith('/portal/')) {
    const portalPath = join(rootDir, 'portal.html');
    if (existsSync(portalPath)) return serveFile(res, portalPath);
  }

  if (requestPath.startsWith('/adminportal/')) {
    const adminPortalPath = join(rootDir, 'adminportal.html');
    if (existsSync(adminPortalPath)) return serveFile(res, adminPortalPath);
  }

  const landingPath = join(rootDir, 'index.html');
  if (existsSync(landingPath)) {
    return serveFile(res, landingPath);
  }

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(port, '0.0.0.0', () => {
  console.log(`CredX admin web listening on port ${port}`);
});
