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
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\//, '');
  const filePath = safePath(relativePath);

  if (existsSync(filePath)) {
    const fileStat = await stat(filePath);
    if (fileStat.isFile()) {
      return serveFile(res, filePath);
    }
  }

  const adminAssetPath = requestPath.startsWith('/adminportal/')
    ? safePath(requestPath.replace(/^\/adminportal\//, ''))
    : null;

  if (adminAssetPath && existsSync(adminAssetPath)) {
    const fileStat = await stat(adminAssetPath);
    if (fileStat.isFile()) {
      return serveFile(res, adminAssetPath);
    }
  }

  const indexPath = join(rootDir, 'index.html');
  if (existsSync(indexPath)) {
    return serveFile(res, indexPath);
  }

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(port, '0.0.0.0', () => {
  console.log(`CredX admin web listening on port ${port}`);
});
