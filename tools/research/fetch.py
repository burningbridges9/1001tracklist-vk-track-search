"""Download 1001tracklists pages for markup analysis (keeps cookies).

Usage: python fetch.py <url> <outfile> [referer]
"""
import gzip
import http.cookiejar
import io
import sys
import time
import urllib.error
import urllib.request

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

JAR = http.cookiejar.CookieJar()
OPENER = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(JAR))


def get(url, referer=None):
    headers = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip",
        "Upgrade-Insecure-Requests": "1",
        "Connection": "close",
    }
    if referer:
        headers["Referer"] = referer
    req = urllib.request.Request(url, headers=headers)
    with OPENER.open(req, timeout=60) as resp:
        raw = resp.read()
        if resp.headers.get("Content-Encoding") == "gzip":
            raw = gzip.GzipFile(fileobj=io.BytesIO(raw)).read()
        return raw


def main():
    url, out = sys.argv[1], sys.argv[2]
    referer = sys.argv[3] if len(sys.argv) > 3 else None
    try:
        raw = get("https://www.1001tracklists.com/")
        print("home ok", len(raw))
        time.sleep(0.6)
    except urllib.error.HTTPError as exc:
        print("home failed", exc)
    raw = get(url, referer)
    with open(out, "wb") as fh:
        fh.write(raw)
    print("saved", out, len(raw), "bytes")


if __name__ == "__main__":
    main()
