// Petit serveur local : `node start.mjs --open` puis http://localhost:3000.
// Les modules ES et fetch() ne marchent pas depuis un fichier ouvert
// directement, d'où ce serveur ; sur GitHub Pages, rien à lancer.
import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
let port = 3000;
let openBrowser = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--open') openBrowser = true;
  else if (args[i] === '--port' && /^\d+$/.test(args[i + 1] ?? '')) port = Number(args[++i]);
  else { console.error('Utilisation : node start.mjs [--open] [--port 3000]'); process.exit(1); }
}

const root = await realpath(dirname(fileURLToPath(import.meta.url)));
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.ttf': 'font/ttf',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = resolve(root, '.' + path);
    if (!file.startsWith(root + sep) && file !== root) { response.writeHead(403); response.end(); return; }
    const info = await stat(file).catch(() => null);
    if (!info || !info.isFile()) { response.writeHead(404); response.end('Introuvable'); return; }
    response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    response.end(await readFile(file));
  } catch (error) {
    response.writeHead(500); response.end(String(error));
  }
});

server.listen(port, () => {
  const address = `http://localhost:${server.address().port}/`;
  console.log(`Carrousel Studio : ${address}`);
  if (openBrowser) {
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    spawn(command, [address], { shell: process.platform === 'win32', stdio: 'ignore', detached: true }).unref();
  }
});
