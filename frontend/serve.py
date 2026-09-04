"""Static file server for the CareerNexus frontend.

Same as `python -m http.server 5500` but with directory listings turned OFF —
a bare folder URL (e.g. /pages/) returns 404 instead of listing every file.
Real hosts (Netlify, Vercel, nginx, GitHub Pages) already do this; this keeps
local dev consistent with them.

Usage:   python serve.py [port]      (default port 5500, bound to 127.0.0.1)
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5500
ROOT = str(Path(__file__).resolve().parent)


class NoListingHandler(SimpleHTTPRequestHandler):
    def list_directory(self, path):
        self.send_error(404, "Not found")
        return None

    def end_headers(self):
        # Never let the browser cache pages during development. A cached .html
        # keeps pointing at an old ?v= asset URL, so edits to js/css appear to
        # do nothing until you manually clear the cache — a nasty surprise
        # mid-demo. Static hosts set their own caching in production.
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    handler = partial(NoListingHandler, directory=ROOT)
    with ThreadingHTTPServer(("127.0.0.1", PORT), handler) as httpd:
        print(f"CareerNexus frontend on http://127.0.0.1:{PORT}  (serving {ROOT})")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")
