#!/usr/bin/env python3
"""Máy chủ sửa bài chạy trên máy của bạn (chỉ nhận kết nối từ chính máy này).

Cách dùng: nhấp đúp Sua-bai.command, hoặc chạy  python3 edit-server.py
Trình duyệt mở bài ở chế độ sửa. Bấm Lưu (hoặc Ctrl/Cmd + S) là index.html được ghi đè;
bản cũ được giữ trong thư mục _ban-sao (20 bản gần nhất). Tắt máy chủ: Ctrl + C trong cửa sổ Terminal.
"""
import http.server, json, os, sys, time, webbrowser, socketserver, glob

ROOT = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(ROOT, 'index.html')
BACKUP = os.path.join(ROOT, '_ban-sao')
PORT = int(os.environ.get('PORT', '8090'))
MAX = 32 * 1024 * 1024


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        if self.path.split('?')[0].endswith('/__ping'):
            return self.reply(200, 'vds-edit')
        return super().do_GET()

    def do_POST(self):
        if not self.path.split('?')[0].endswith('/__save'):
            return self.reply(404, 'Không có')
        origin = self.headers.get('Origin', '')
        if origin and origin not in (f'http://127.0.0.1:{PORT}', f'http://localhost:{PORT}'):
            return self.reply(403, 'Không cho phép')
        n = int(self.headers.get('Content-Length', '0'))
        if not 0 < n <= MAX:
            return self.reply(413, 'Dữ liệu quá lớn')
        try:
            html = json.loads(self.rfile.read(n).decode('utf-8'))['html']
        except Exception:
            return self.reply(400, 'Dữ liệu không hợp lệ')
        if not html.lstrip().lower().startswith('<!doctype html') or 'id="copy"' not in html:
            return self.reply(400, 'Nội dung không phải bài này')
        os.makedirs(BACKUP, exist_ok=True)
        if os.path.exists(TARGET):
            stamp = time.strftime('%Y%m%d-%H%M%S')
            with open(TARGET, 'rb') as f, open(os.path.join(BACKUP, f'index-{stamp}.html'), 'wb') as b:
                b.write(f.read())
            for old in sorted(glob.glob(os.path.join(BACKUP, 'index-*.html')))[:-20]:
                os.remove(old)
        tmp = TARGET + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            f.write(html)
        os.replace(tmp, TARGET)
        print(time.strftime('%H:%M:%S'), 'Đã lưu index.html')
        return self.reply(200, 'ok')

    def reply(self, code, text):
        body = text.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(('127.0.0.1', PORT), Handler) as srv:
        url = f'http://127.0.0.1:{PORT}/index.html?edit=1'
        print('Đang mở chế độ sửa:', url)
        print('Bấm Ctrl + C để tắt.')
        if '--no-browser' not in sys.argv:
            webbrowser.open(url)
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            pass
