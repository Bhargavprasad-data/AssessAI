const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = fs.existsSync(path.join(__dirname, 'dist'))
  ? path.join(__dirname, 'dist')
  : path.join(__dirname, 'build');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const BACKEND_URL = (process.env.BACKEND_URL || process.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

const server = http.createServer((req, res) => {
  // Reverse proxy /api requests to backend
  if (req.url.startsWith('/api/') || req.url === '/api' || req.url.startsWith('/ws')) {
    try {
      const backendTarget = new URL(req.url, BACKEND_URL);
      const isHttps = backendTarget.protocol === 'https:';
      const clientLib = isHttps ? require('https') : http;

      const proxyReq = clientLib.request({
        protocol: backendTarget.protocol,
        hostname: backendTarget.hostname,
        port: backendTarget.port || (isHttps ? 443 : 80),
        path: backendTarget.pathname + backendTarget.search,
        method: req.method,
        headers: {
          ...req.headers,
          host: backendTarget.host,
        },
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      });

      proxyReq.on('error', (err) => {
        console.error('[proxy error]', err.message);
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ detail: 'Backend server is not reachable on ' + BACKEND_URL }));
        }
      });

      req.pipe(proxyReq, { end: true });
      return;
    } catch (proxyErr) {
      console.error('[proxy parse error]', proxyErr);
    }
  }

  const urlPath = req.url.split('?')[0];
  let safePath = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(PUBLIC_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        // SPA Fallback: Serve index.html for client-side routing
        const indexPath = path.join(PUBLIC_DIR, 'index.html');
        fs.readFile(indexPath, (indexErr, indexData) => {
          if (indexErr) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found - Build directory is empty.');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(indexData);
          }
        });
      } else {
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`==> Production Static SPA Server running on port ${PORT} (~15MB RAM usage)`);
  console.log(`==> Serving files from: ${PUBLIC_DIR}`);
});
