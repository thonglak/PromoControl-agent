#!/usr/bin/env python3
"""
PromoControl — Sale Entry Simulator Server
รันที่ http://localhost:8555
"""
import http.server
import os

PORT = 8555
DIRECTORY = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        if self.path == '/' or self.path == '':
            self.path = '/sale-entry.html'
        elif self.path == '/v2' or self.path == '/v2/':
            self.path = '/sale-entry-v2.html'
        elif self.path == '/promotion-items' or self.path == '/promotion-items/':
            self.path = '/promotion-items.html'
        return super().do_GET()


def main():
    with http.server.HTTPServer(('0.0.0.0', PORT), Handler) as httpd:
        print(f'╔══════════════════════════════════════════════════════╗')
        print(f'║  PromoControl — Simulator                             ║')
        print(f'║  Sale Entry:       http://localhost:{PORT}                ║')
        print(f'║  Sale Entry (v2):  http://localhost:{PORT}/v2             ║')
        print(f'║  Promotion Items:  http://localhost:{PORT}/promotion-items ║')
        print(f'╚══════════════════════════════════════════════════════╝')
        print(f'กด Ctrl+C เพื่อหยุด server')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nหยุด server แล้ว')


if __name__ == '__main__':
    main()
