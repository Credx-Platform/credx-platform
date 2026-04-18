import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('./dist', import.meta.url));
const port = Number(process.env.PORT ?? 4173);

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

  if (requestPath === '/' || requestPath === '/index.html') {
    const landingPath = join(rootDir, 'index.html');
    if (existsSync(landingPath)) return serveFile(res, landingPath);
  }

  if (requestPath === '/portal' || requestPath === '/portal/') {
    const portalPath = join(rootDir, 'portal.html');
    if (existsSync(portalPath)) return serveFile(res, portalPath);
  }

  if (requestPath === '/adminportal' || requestPath === '/adminportal/') {
    const adminPortalPath = join(rootDir, 'adminportal.html');
    if (existsSync(adminPortalPath)) return serveFile(res, adminPortalPath);
  }

  const relativePath = requestPath.replace(/^\//, '');
  const filePath = safePath(relativePath);
  if (existsSync(filePath)) {
    const fileStat = await stat(filePath);
    if (fileStat.isFile()) {
      return serveFile(res, filePath);
    }
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
