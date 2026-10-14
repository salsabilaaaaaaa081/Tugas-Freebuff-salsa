'use strict';
/* Server statis bawaan Node — tanpa dependensi, untuk `npm run dev` */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8'
};

const server = http.createServer(function (req, res) {
  try {
    /* log setiap permintaan — untuk memastikan paket benar-benar sampai ke server */
    res.on('finish', function () {
      console.log('[akses] ' + req.method + ' ' + req.url + ' -> ' + res.statusCode);
    });
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('405 Method Not Allowed');
      return;
    }
    const urlPath = decodeURIComponent(String(req.url || '/').split('?')[0]);
    let rel = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    let file = path.join(ROOT, rel);

    /* cegah path traversal keluar dari folder proyek */
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('403 Forbidden');
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      file = path.join(file, 'index.html');
    }
    if (!fs.existsSync(file)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + urlPath);
      return;
    }

    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = fs.createReadStream(file);
    stream.on('error', function () { res.destroy(); });
    stream.pipe(res);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('500 Internal Server Error');
  }
});

let triedFallback = false;

function onReady() {
  console.log('GanttPro berjalan di  http://localhost:' + PORT + '   (alternatif: http://127.0.0.1:' + PORT + ')');
  console.log('Uji unit            : http://127.0.0.1:' + PORT + '/tests/tests.html');
  console.log('Hentikan server     : Ctrl+C');
  console.log('(log [akses] akan muncul tiap kali ada halaman dimuat)');
}

server.on('error', function (err) {
  /* IPv6 tidak tersedia di mesin ini -> ulangi dengan IPv4 murni */
  if ((err.code === 'EAFNOSUPPORT' || err.code === 'ENOTSUP' || err.code === 'EADDRNOTAVAIL') && !triedFallback) {
    triedFallback = true;
    server.listen({ port: PORT, host: '0.0.0.0' }, onReady);
    return;
  }
  if (err.code === 'EADDRINUSE') {
    console.error('Port ' + PORT + ' sudah dipakai proses lain.');
    console.error('Solusi: tutup program yang memakainya, atau jalankan dengan port lain:');
    console.error('  Windows (cmd) : set PORT=3000 && npm run dev');
    console.error('  PowerShell    : $env:PORT=3000; npm run dev');
    console.error('  Linux/macOS   : PORT=3000 npm run dev');
  } else {
    console.error('Gagal menjalankan server:', err.message);
  }
  process.exit(1);
});

/* dual-stack: '::' dengan ipv6Only:false menerima koneksi localhost IPv4 DAN IPv6 */
server.listen({ port: PORT, host: '::', ipv6Only: false }, onReady);
