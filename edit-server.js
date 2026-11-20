#!/usr/bin/env node
/**
 * Máy chủ sửa bài chạy trên máy của bạn (Node.js).
 * Hỗ trợ lưu bài trực tiếp vào index.html và tự động sao lưu vào _ban-sao/
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT = __dirname;
const TARGET = path.join(ROOT, 'index.html');
const BACKUP = path.join(ROOT, '_ban-sao');
const PORT = parseInt(process.env.PORT || '8090', 10);
const MAX = 32 * 1024 * 1024;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

function reply(res, code, text, contentType = 'text/plain; charset=utf-8') {
  const body = Buffer.from(text, 'utf-8');
  res.writeHead(code, {
    'Content-Type': contentType,
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = decodeURIComponent(reqUrl.pathname);

  // Health check / ping
  if (pathname === '/__ping' || pathname.endsWith('/__ping')) {
    if (req.method === 'GET') {
      return reply(res, 200, 'vds-edit');
    }
    return reply(res, 405, 'Method Not Allowed');
  }

  // Save handler
  if (pathname === '/__save' || pathname.endsWith('/__save')) {
    if (req.method !== 'POST') {
      return reply(res, 405, 'Chỉ nhận POST');
    }

    const origin = req.headers['origin'] || '';
    if (origin && origin !== `http://127.0.0.1:${PORT}` && origin !== `http://localhost:${PORT}`) {
      return reply(res, 403, 'Không cho phép');
    }

    const len = parseInt(req.headers['content-length'] || '0', 10);
    if (len <= 0 || len > MAX) {
      return reply(res, 413, 'Dữ liệu quá lớn');
    }

    let chunks = [];
    let received = 0;

    req.on('data', chunk => {
      received += chunk.length;
      if (received > MAX) {
        req.destroy();
        return reply(res, 413, 'Dữ liệu quá lớn');
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const bodyStr = Buffer.concat(chunks).toString('utf-8');
        const data = JSON.parse(bodyStr);
        const html = data.html || '';

        if (!html.trim().toLowerCase().startsWith('<!doctype html') || !html.includes('id="copy"')) {
          return reply(res, 400, 'Nội dung không phải bài này');
        }

        if (!fs.existsSync(BACKUP)) {
          fs.mkdirSync(BACKUP, { recursive: true });
        }

        if (fs.existsSync(TARGET)) {
          const now = new Date();
          const stamp = now.getFullYear().toString() +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0') + '-' +
            String(now.getHours()).padStart(2, '0') +
            String(now.getMinutes()).padStart(2, '0') +
            String(now.getSeconds()).padStart(2, '0');
          fs.copyFileSync(TARGET, path.join(BACKUP, `index-${stamp}.html`));

          // Retain last 20 backups
          const backups = fs.readdirSync(BACKUP)
            .filter(f => f.startsWith('index-') && f.endsWith('.html'))
            .sort();
          if (backups.length > 20) {
            backups.slice(0, backups.length - 20).forEach(old => {
              try { fs.unlinkSync(path.join(BACKUP, old)); } catch (e) {}
            });
          }
        }

        const tmp = TARGET + '.tmp';
        fs.writeFileSync(tmp, html, 'utf-8');
        fs.renameSync(tmp, TARGET);

        const timeStr = new Date().toLocaleTimeString('vi-VN');
        console.log(`[${timeStr}] Đã lưu index.html`);
        return reply(res, 200, 'ok');
      } catch (err) {
        console.error('Lỗi khi lưu:', err);
        return reply(res, 500, 'Lỗi lưu file: ' + err.message);
      }
    });
    return;
  }

  // Serve static files
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }
  const filePath = path.join(ROOT, safePath);

  // Security check: must be inside ROOT
  if (!filePath.startsWith(ROOT)) {
    return reply(res, 403, 'Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      return reply(res, 404, 'Không tìm thấy file');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-store'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}/index.html`;
  const editUrl = `http://127.0.0.1:${PORT}/index.html?edit=1`;
  console.log(`\n======================================================`);
  console.log(` Máy chủ đang chạy tại: ${url}`);
  console.log(` Chế độ sửa bài tại:    ${editUrl}`);
  console.log(` Bấm Ctrl + C để dừng máy chủ.`);
  console.log(`======================================================\n`);

  if (!process.argv.includes('--no-browser')) {
    const targetUrl = process.argv.includes('--edit') ? editUrl : url;
    if (process.platform === 'win32') {
      exec(`start "" "${targetUrl}"`);
    } else if (process.platform === 'darwin') {
      exec(`open "${targetUrl}"`);
    } else {
      exec(`xdg-open "${targetUrl}"`);
    }
  }
});
