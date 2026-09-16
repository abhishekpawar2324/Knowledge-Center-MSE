"""Knowledge Center smoke test.

There is no unit-test suite or CI for this project, so this script is the
regression net: run it before and after any change to frontend/ or backend/.

    runtime\\python.exe tools\\smoke.py

It checks four things:

  1. API      - the documented endpoints answer, public and authenticated
  2. Function - the app boots, renders the right sections per auth state,
                navigation resolves to exactly one page, the theme toggle
                round-trips and persists
  3. Console  - no uncaught JS errors while the app loads and is driven
  4. Contrast - no body text below WCAG AA against its own background

Exit code is 0 when everything passes, 1 otherwise, so it can be wired into a
pipeline later. The browser checks are skipped automatically (not failed) when
no Chromium-based browser is installed, so this still gives useful signal on a
headless server.

Options:
    --base-url URL   test an already-running instance (default http://127.0.0.1:8000)
    --no-browser     API checks only
    --keep-server    leave a server this script started running afterwards
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND = os.path.join(REPO, "frontend")
PROBE_NAME = "_smoke_probe.html"          # temporary; always cleaned up
PROBE_PATH = os.path.join(FRONTEND, PROBE_NAME)

BROWSERS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
]

PUBLIC_ENDPOINTS = [
    "/", "/api/products/overview", "/api/stats", "/api/spaces", "/api/tags",
    "/api/notifications", "/api/pinned", "/api/search?q=connector&product=xpi",
    "/api/document/42", "/magic_logo.png", "/favicon.ico",
]
AUTHED_ENDPOINTS = [
    "/api/favorites", "/api/my/contributions", "/api/review/queue",
    "/api/admin/users", "/api/admin/analytics", "/api/admin/contributions",
    "/api/downloads",
]

results: list[tuple[bool, str]] = []


def record(ok: bool, label: str, detail: str = "") -> bool:
    results.append((ok, label))
    print(f"  {'PASS' if ok else 'FAIL'}  {label}{('  -> ' + detail) if detail and not ok else ''}")
    return ok


# --------------------------------------------------------------------------- http

def http(url: str, token: str | None = None, data: bytes | None = None,
         timeout: int = 30, retries: int = 1) -> tuple[int, str]:
    """GET/POST a URL. Returns (status, body); status 0 means the request never
    completed. Transport failures are retried once because the app indexes in
    the background at start-up and can briefly stall a request."""
    last = ""
    for attempt in range(retries + 1):
        req = urllib.request.Request(url, data=data)
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, r.read(80_000).decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            return e.code, ""                    # a real HTTP status, do not retry
        except Exception as e:                   # refused, reset, timeout, ...
            last = f"{type(e).__name__}: {e}"
            if attempt < retries:
                time.sleep(3)
    return 0, last


def login(base: str) -> str | None:
    body = b"username=admin&password=admin"
    req = urllib.request.Request(base + "/api/auth/login", data=body)
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read()).get("access_token")
    except Exception:
        return None


# --------------------------------------------------------------------------- server

def wait_until_up(base: str, seconds: int = 60) -> bool:
    for _ in range(seconds):
        if http(base + "/", timeout=3)[0] == 200:
            return True
        time.sleep(1)
    return False


def start_server(base: str):
    """Start uvicorn if nothing is answering. Returns the process, or None."""
    if http(base + "/", timeout=3)[0] == 200:
        print("  (using the server already running)")
        return None
    py = os.path.join(REPO, "runtime", "python.exe")
    py = py if os.path.exists(py) else sys.executable
    print("  (starting a server for this run)")
    proc = subprocess.Popen(
        [py, "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=REPO, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    if not wait_until_up(base):
        proc.terminate()
        raise SystemExit("could not start a server on " + base)
    return proc


# --------------------------------------------------------------------------- browser

def find_browser() -> str | None:
    return next((b for b in BROWSERS if os.path.exists(b)), None)


PROBE_JS = r"""
<script>
(function () {
  var errors = [];
  window.addEventListener('error', function (e) { errors.push(String(e.message)); });
  window.addEventListener('unhandledrejection', function (e) { errors.push('rejection: ' + e.reason); });
  var _err = console.error;
  console.error = function () { errors.push('console.error: ' + Array.prototype.join.call(arguments, ' ')); _err.apply(console, arguments); };

  function emit(o) {
    o.consoleErrors = errors;
    var pre = document.createElement('pre');
    pre.id = '__smoke__';
    pre.textContent = JSON.stringify(o);
    document.documentElement.appendChild(pre);
  }

  // WCAG relative luminance; returns null when the colour is see-through.
  function lum(c) {
    var m = (c || '').match(/[\d.]+/g); if (!m) return null;
    if (m.length > 3 && parseFloat(m[3]) < 0.5) return null;
    var v = [m[0], m[1], m[2]].map(function (x) {
      x = x / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function groundOf(el) {
    for (var n = el; n && n !== document.documentElement; n = n.parentElement) {
      var cs = getComputedStyle(n);
      // an element painting a gradient is a coloured surface we cannot sample
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      var l = lum(cs.backgroundColor);
      if (l !== null) return l;
    }
    return lum(getComputedStyle(document.body).backgroundColor);
  }
  function contrastFailures() {
    var bad = [];
    document.querySelectorAll('body *').forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      var cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.3) return;
      if (cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)') return;   // gradient-clipped text
      var text = Array.prototype.filter.call(el.childNodes, function (n) { return n.nodeType === 3; })
        .map(function (n) { return n.textContent.trim(); }).join('');
      if (text.length < 2) return;
      var fg = lum(cs.color); if (fg === null) return;
      var bg = groundOf(el); if (bg === null) return;             // unknown ground: skip
      var hi = Math.max(fg, bg), lo = Math.min(fg, bg);
      var ratio = (hi + 0.05) / (lo + 0.05);
      if (ratio < 3.0) bad.push(ratio.toFixed(2) + ':1 "' + text.slice(0, 40) + '"');
    });
    return bad;
  }

  function visiblePages() {
    return ['page-home-landing', 'page-product-workspace', 'page-upload-portal',
            'page-utilities-hub', 'page-admin-suite', 'page-login']
      .filter(function (id) { var e = document.getElementById(id); return e && !e.classList.contains('hide'); });
  }

  window.addEventListener('load', function () {
    // Signed-in pass: authenticate, stash the session, reload once so the app
    // picks it up at start-up, then fall through to the assertions.
    if (SMOKE_AUTH && !sessionStorage.getItem('smokeSeeded')) {
      var fd = new FormData(); fd.append('username', 'admin'); fd.append('password', 'admin');
      fetch('/api/auth/login', { method: 'POST', body: fd })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          localStorage.setItem('token', d.access_token);
          localStorage.setItem('username', d.username);
          localStorage.setItem('role', d.role);
          localStorage.setItem('kc_theme', SMOKE_THEME);
          sessionStorage.setItem('smokeSeeded', '1');
          location.reload();
        })
        .catch(function (e) { emit({ fatal: 'login failed: ' + e }); });
      return;
    }
    if (!SMOKE_AUTH) { try { localStorage.clear(); } catch (e) {} }

    setTimeout(function () {
      var out = {};
      try {
        out.theme = document.documentElement.getAttribute('data-theme');
        out.signedIn = !!localStorage.getItem('token');
        out.sections = document.querySelectorAll('#landing-sections .landing-section').length;
        out.productCards = document.querySelectorAll('.product-card').length;
        out.headerPresent = !!document.querySelector('.main-header');
        out.bootPages = visiblePages();

        // navigation must resolve to exactly one visible page
        var nav = {};
        var dl = document.getElementById('btn-tab-utilities');
        if (dl) { dl.click(); nav.downloads = visiblePages(); }
        var logo = document.getElementById('header-brand-logo');
        if (logo) { logo.click(); nav.home = visiblePages(); }
        out.nav = nav;

        // theme toggle must flip and persist
        var t = document.getElementById('btn-theme-toggle');
        if (t) {
          var before = document.documentElement.getAttribute('data-theme');
          t.click();
          out.themeAfterToggle = document.documentElement.getAttribute('data-theme');
          out.themeStored = localStorage.getItem('kc_theme');
          out.themeFlipped = out.themeAfterToggle !== before;
          t.click();
        }
        out.contrast = contrastFailures();
      } catch (e) {
        out.fatal = String(e && e.message || e);
      }
      emit(out);
    }, 1200);
  });
})();
</script>
"""


def run_probe(browser: str, base: str, authed: bool, theme: str) -> dict:
    """Render the app with an assertion script injected and return its findings."""
    src = open(os.path.join(FRONTEND, "index.html"), encoding="utf-8").read()
    header = f"<script>var SMOKE_AUTH={'true' if authed else 'false'};var SMOKE_THEME='{theme}';</script>"
    open(PROBE_PATH, "w", encoding="utf-8").write(
        src.replace("</body>", header + PROBE_JS + "</body>")
    )
    profile = tempfile.mkdtemp(prefix="kc_smoke_")
    try:
        out = subprocess.run(
            [browser, "--headless=new", "--disable-gpu", "--no-first-run",
             f"--user-data-dir={profile}", "--virtual-time-budget=20000",
             "--dump-dom", f"{base}/{PROBE_NAME}"],
            capture_output=True, text=True, timeout=180,
            encoding="utf-8", errors="replace",
        ).stdout or ""
        m = re.search(r'<pre id="__smoke__">(.*?)</pre>', out, re.S)
        if not m:
            return {"fatal": "probe produced no result (browser or page failed to run)"}
        raw = m.group(1)
        for a, b in (("&quot;", '"'), ("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">")):
            raw = raw.replace(a, b)
        return json.loads(raw)
    except Exception as e:
        return {"fatal": f"{type(e).__name__}: {e}"}
    finally:
        try:
            os.remove(PROBE_PATH)
        except OSError:
            pass
        shutil.rmtree(profile, ignore_errors=True)


# --------------------------------------------------------------------------- checks

def check_api(base: str) -> None:
    print("\nAPI")
    for path in PUBLIC_ENDPOINTS:
        code, body = http(base + path)
        record(code == 200, f"public  {path}", f"HTTP {code} {body[:90] if code == 0 else ''}")
    token = login(base)
    if not record(bool(token), "login as admin"):
        return
    for path in AUTHED_ENDPOINTS:
        code, body = http(base + path, token=token)
        record(code == 200, f"authed  {path}", f"HTTP {code} {body[:90] if code == 0 else ''}")
    code, _ = http(base + "/api/favorites")
    record(code == 401, "authed endpoint rejects anonymous", f"HTTP {code} (want 401)")


def check_browser(browser: str, base: str) -> None:
    for authed, theme, want_sections in ((False, "dark", 2), (True, "light", 4)):
        who = "signed in" if authed else "guest"
        print(f"\nBrowser - {who}, {theme}")
        r = run_probe(browser, base, authed, theme)
        if r.get("fatal"):
            record(False, f"{who}: probe ran", r["fatal"])
            continue
        record(r.get("headerPresent") is True, f"{who}: header renders")
        record(r.get("productCards") == 3, f"{who}: 3 product cards", str(r.get("productCards")))
        record(r.get("sections") == want_sections,
               f"{who}: {want_sections} landing sections", str(r.get("sections")))
        record(r.get("bootPages") == ["page-home-landing"],
               f"{who}: boots to the landing page only", str(r.get("bootPages")))
        nav = r.get("nav") or {}
        for name, pages in nav.items():
            record(len(pages) == 1, f"{who}: '{name}' shows exactly one page", str(pages))
        if authed:
            record(r.get("theme") == theme, f"{who}: stored theme applied", str(r.get("theme")))
            record(r.get("themeFlipped") is True, "theme toggle flips")
            record(r.get("themeStored") == r.get("themeAfterToggle"), "theme choice persists")
        errs = r.get("consoleErrors") or []
        record(not errs, f"{who}: no console errors", "; ".join(errs[:3]))
        bad = r.get("contrast") or []
        record(not bad, f"{who}: text contrast >= AA", f"{len(bad)} below 3:1 -> " + "; ".join(bad[:3]))


# --------------------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description="Knowledge Center smoke test")
    ap.add_argument("--base-url", default="http://127.0.0.1:8000")
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--keep-server", action="store_true")
    args = ap.parse_args()
    base = args.base_url.rstrip("/")

    # never leave a probe behind from an earlier interrupted run
    if os.path.exists(PROBE_PATH):
        os.remove(PROBE_PATH)

    print("Knowledge Center smoke test")
    print(f"  target: {base}")
    proc = start_server(base)
    try:
        check_api(base)
        if args.no_browser:
            print("\nBrowser\n  SKIP  --no-browser given")
        else:
            browser = find_browser()
            if browser:
                check_browser(browser, base)
            else:
                print("\nBrowser\n  SKIP  no Chromium-based browser found")
    finally:
        if proc and not args.keep_server:
            proc.terminate()
            try:
                proc.wait(timeout=15)
            except Exception:
                proc.kill()

    failed = [label for ok, label in results if not ok]
    print("\n" + "-" * 60)
    print(f"{len(results) - len(failed)}/{len(results)} passed")
    if failed:
        print("FAILED:")
        for label in failed:
            print("  - " + label)
    print("RESULT:", "PASS" if not failed else "FAIL")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
