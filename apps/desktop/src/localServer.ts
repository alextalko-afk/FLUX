import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';
import * as tls from 'node:tls';
import * as fs from 'node:fs';
import * as path from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
};

/**
 * The packaged app serves the web client from this loopback server and forwards /api and /ws to the FLUX server.
 * Everything stays same-origin for the page (cookies, CSRF, relative media URLs, router paths), exactly like the
 * production nginx setup, and the app works without a file:// origin.
 */
export function startLocalServer(distDir: string, serverUrl: string, preferredPort: number): Promise<string> {
  const target = new URL(serverUrl);
  const secure = target.protocol === 'https:';
  const targetPort = Number(target.port || (secure ? 443 : 80));
  const client = secure ? https : http;

  const server = http.createServer((req, res) => {
    const url = req.url ?? '/';
    if (url.startsWith('/api/')) {
      const upstream = client.request(
        {
          host: target.hostname,
          port: targetPort,
          path: url,
          method: req.method,
          headers: { ...req.headers, host: target.host },
        },
        (up) => {
          res.writeHead(up.statusCode ?? 502, up.headers);
          up.pipe(res);
        },
      );
      upstream.on('error', () => {
        if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'FLUX server is unreachable' }));
      });
      req.pipe(upstream);
      return;
    }

    const pathname = decodeURIComponent(url.split('?')[0] ?? '/');
    let file = path.normalize(path.join(distDir, pathname));
    // Never leave the dist folder; anything unknown is a client-side route and gets index.html.
    if (!file.startsWith(distDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(distDir, 'index.html');
    }
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': TYPES[ext] ?? 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    fs.createReadStream(file).pipe(res);
  });

  server.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith('/ws')) return socket.destroy();
    const upstream: net.Socket = secure
      ? tls.connect({ host: target.hostname, port: targetPort, servername: target.hostname })
      : net.connect(targetPort, target.hostname);
    upstream.on('connect', () => forward());
    upstream.on('secureConnect', () => forward());
    let sent = false;
    const forward = () => {
      if (sent) return;
      sent = true;
      const headers = Object.entries({ ...req.headers, host: target.host, origin: `${target.protocol}//${target.host}` })
        .map(([k, v]) => `${k}: ${v}`)
        .join('\r\n');
      upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${headers}\r\n\r\n`);
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    };
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
  });

  return new Promise((resolve, reject) => {
    const listen = (port: number) => {
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && port !== 0) listen(0);
        else reject(err);
      });
      server.listen(port, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as net.AddressInfo).port}`));
    };
    listen(preferredPort);
  });
}
