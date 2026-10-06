#!/usr/bin/env python3
"""Tiny local server for the Brokerage CRM. Standard library only.

Serves this folder and saves your data to ../data/brokerage.json on your own disk.
Listens on 127.0.0.1 only, so nothing on your network (or the internet) can reach it.
"""
import http.server, json, os, shutil, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(os.path.dirname(HERE), "data")
DATA = os.path.join(DATA_DIR, "brokerage.json")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=HERE, **k)

    def log_message(self, *a):
        pass

    def _origin_ok(self):
        o = self.headers.get("Origin")
        return o is None or o in (f"http://127.0.0.1:{PORT}", f"http://localhost:{PORT}")

    def _json(self, code, body=b"{}"):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/state":
            if not self._origin_ok():
                return self._json(403)
            try:
                with open(DATA, "rb") as f:
                    return self._json(200, f.read())
            except FileNotFoundError:
                return self._json(200)
        return super().do_GET()

    def do_PUT(self):
        if self.path != "/api/state" or not self._origin_ok():
            return self._json(403)
        n = int(self.headers.get("Content-Length", 0))
        if n > 50_000_000:
            return self._json(413)
        raw = self.rfile.read(n)
        try:
            json.loads(raw)
        except ValueError:
            return self._json(400)
        os.makedirs(DATA_DIR, exist_ok=True)
        if os.path.exists(DATA):
            shutil.copyfile(DATA, DATA + ".prev")  # one-step undo
        fd, tmp = tempfile.mkstemp(dir=DATA_DIR)
        with os.fdopen(fd, "wb") as f:
            f.write(raw)
        os.replace(tmp, DATA)
        return self._json(200)


if __name__ == "__main__":
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Brokerage CRM running at http://127.0.0.1:{PORT}  (Ctrl+C to stop)")
    srv.serve_forever()
