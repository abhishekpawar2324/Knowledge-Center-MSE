"""Knowledge Center smoke test.

There is no unit-test suite or CI for this project, so this script is the
regression net: run it before and after any change to frontend/ or backend/.

    runtime\\python.exe tools\\smoke.py

It checks five things:

  1. API      - the documented endpoints answer, public and authenticated
  2. Vendors  - every third-party script is pinned to an exact version and
                that version actually resolves on the CDN
  3. Function - the app boots, renders the right sections per auth state,
                navigation resolves to exactly one page, the theme toggle
                round-trips and persists, and lucide/marked/Chart all work
  4. Console  - no uncaught JS errors while the app loads and is driven
  5. Contrast - no body text below WCAG AA against its own background

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
    "/magic_logo.png", "/favicon.ico",
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

  // The three CDN libraries. Each is exercised, not merely checked for
  // existence: a script tag that 404s still leaves the page loading, and the
  // failure only shows up later as unrendered icons or raw markdown on screen.
  function vendorChecks() {
    var v = {};
    try {
      v.lucide = false;
      if (window.lucide && typeof lucide.createIcons === 'function') {
        var probe = document.createElement('div');
        probe.innerHTML = '<i data-lucide="search"></i>';
        probe.style.cssText = 'position:absolute;left:-9999px';
        document.body.appendChild(probe);
        lucide.createIcons();
        v.lucide = !!probe.querySelector('svg');
        probe.parentNode.removeChild(probe);
      }
    } catch (e) { v.lucide = 'threw: ' + e.message; }
    try {
      var parse = window.marked && (marked.parse || marked);
      v.marked = typeof parse === 'function' && /<strong>ok<\/strong>/.test(parse('**ok**'));
    } catch (e) { v.marked = 'threw: ' + e.message; }
    try {
      v.chart = typeof window.Chart === 'function' && !!window.Chart.version;
      v.chartVersion = window.Chart ? window.Chart.version : null;
    } catch (e) { v.chart = 'threw: ' + e.message; }
    return v;
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
      var deferred = false;          // the workspace pass emits asynchronously
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
        // An admin who visited Copilot > Settings left that pane un-hidden;
        // signing out hid the tab button but not the pane, so the modal
        // reopened onto the configuration screen for the next visitor.
        var copilotBtn = document.getElementById('btn-open-copilot');
        if (copilotBtn) {
          copilotBtn.click();
          var sPane = document.getElementById('copilot-pane-settings');
          var sBtn = document.getElementById('copilot-tab-btn-settings');
          function shown(el) {
            if (!el) return false;
            var cs = getComputedStyle(el);
            return !el.classList.contains('hide') && cs.display !== 'none';
          }
          out.copilotSettingsPaneShown = shown(sPane);
          out.copilotSettingsBtnShown = shown(sBtn);
          var close = document.getElementById('btn-close-copilot');
          if (close) close.click();
        }

        out.vendors = vendorChecks();

        // lucide.createIcons() swaps every <i data-lucide="name"> for an <svg>,
        // but silently skips a name it does not know. A misspelled icon is
        // therefore invisible rather than broken, so anything still sitting
        // here as an <i> is a bad icon name.
        out.unrenderedIcons = Array.prototype.slice
          .call(document.querySelectorAll('i[data-lucide]'))
          .map(function (el) { return el.getAttribute('data-lucide'); });

        out.contrast = contrastFailures();

        // KB studio footer. Both groups are shrink-to-fit, and as four template
        // buttons they together wanted ~1264px in a 1158px content box - so the
        // browser compressed every button in the row (the Publish CTA lost 24px
        // at 1440px, 61px at 1100px) and the last template sat flush against
        // "Discard Changes" with 0px between them. The templates are one
        // dropdown now, which is why nothing in the row should be shrunk.
        out.kbFooter = (function () {
          var k = {};
          var modal = document.getElementById('modal-write-kb');
          if (!modal) return k;
          var wasHidden = modal.classList.contains('hide');
          modal.classList.remove('hide');
          var tpl = modal.querySelector('.kb-footer-templates');
          var act = modal.querySelector('.kb-footer-actions');
          k.groups = !!tpl && !!act;
          if (tpl && act) {
            var tr = tpl.getBoundingClientRect(), ar = act.getBoundingClientRect();
            k.sameRow = Math.abs(tr.top - ar.top) < 4;
            k.gap = Math.round(ar.left - tr.right);
            // A button narrower than its own content is a squeezed button.
            // Zero-width ones are the closed menu's items, not footer buttons.
            k.squeezed = Array.prototype.filter
              .call(tpl.parentElement.querySelectorAll('button'), function (b) {
                var r = b.getBoundingClientRect();
                if (r.width < 2) return false;
                var c = b.cloneNode(true);
                c.style.cssText = b.style.cssText +
                  ';position:absolute;left:-9999px;width:max-content;flex:none;';
                document.body.appendChild(c);
                var natural = c.getBoundingClientRect().width;
                c.parentNode.removeChild(c);
                return natural > r.width + 1;
              })
              .map(function (b) { return b.textContent.trim().slice(0, 24); });
          }
          var btn = document.getElementById('btn-toggle-template-menu');
          var menu = document.getElementById('kb-template-menu');
          k.hasToggle = !!btn && !!menu;
          if (btn && menu) {
            k.closedAtRest = menu.classList.contains('hide');
            btn.click();
            k.opens = !menu.classList.contains('hide');
            var mr = menu.getBoundingClientRect(), br = btn.getBoundingClientRect();
            var shell = modal.querySelector('.kb-studio-container').getBoundingClientRect();
            // It is anchored at the bottom of the modal, so it must open upward
            // and still be painted inside the shell - the shell clips.
            k.opensUpward = mr.bottom <= br.top + 1;
            k.insideModal = mr.top >= shell.top && mr.bottom <= shell.bottom &&
                            mr.left >= shell.left && mr.right <= shell.right;
            k.itemCount = menu.querySelectorAll('.kb-dropdown-item').length;
            // One line per option: a wrapped label doubles the row height.
            k.wrappedItems = Array.prototype.filter
              .call(menu.querySelectorAll('.kb-dropdown-item'), function (i) {
                return i.getBoundingClientRect().height > 30;
              }).length;
            k.insertWired = typeof window.insertDocTemplate === 'function';
            btn.click();
            k.closesAgain = menu.classList.contains('hide');
          }
          // The toolbar's own menus share the component and must still drop down.
          k.toolbarStillDown = ['btn-toggle-color-menu', 'btn-toggle-highlight-menu',
                                'btn-toggle-code-menu'].every(function (id) {
            var b = document.getElementById(id);
            var m = b && b.parentElement.querySelector('.kb-dropdown-menu');
            if (!b || !m) return false;
            b.click();
            var down = m.getBoundingClientRect().top >= b.getBoundingClientRect().bottom - 2;
            b.click();
            return down;
          });
          if (wasHidden) modal.classList.add('hide');
          return k;
        })();

        // Open a space and check the workspace panes. The sidebar panels are
        // rendered by id, so a panel that has been moved to another column
        // still populates - which means only an explicit "is it in the pane I
        // expect" check can catch a botched relocation.
        var tab = document.querySelector('.product-tab-btn[data-product="xpi"]');
        if (tab) {
          tab.click();
          deferred = true;
          setTimeout(function () {
            try {
              var ws = document.getElementById('page-product-workspace');
              var w = {};
              w.visible = !!ws && !ws.classList.contains('hide');
              w.leftPanes = document.querySelectorAll('.left-sidebar-pane').length;
              w.rightPanes = document.querySelectorAll('.right-sidebar-pane').length;
              var tree = document.getElementById('left-space-tree-container');
              w.treeInLeftPane = !!(tree && tree.closest('.left-sidebar-pane'));
              w.treeItems = tree ? tree.children.length : 0;
              w.railPanels = ['left-pinned-list', 'left-top-favorites-list', 'left-favorites-list']
                .filter(function (id) {
                  var el = document.getElementById(id);
                  return el && el.closest('.right-sidebar-pane');
                });
              // Nothing may be left stranded in the old column.
              w.strayInLeftPane = ['left-pinned-list', 'left-top-favorites-list', 'left-favorites-list']
                .filter(function (id) {
                  var el = document.getElementById(id);
                  return el && el.closest('.left-sidebar-pane');
                });
              // The expand toggle widens .left-sidebar-pane and unwraps titles
              // via a descendant rule, so it only works while the tree is a
              // child of that pane - the one structural coupling in the sidebar.
              var pane = document.querySelector('.left-sidebar-pane');
              var exp = document.getElementById('btn-toggle-sidebar-expand');
              if (pane && exp) {
                // The pane animates width over 0.25s, so measuring straight
                // after the click reads the start of the transition, not the
                // target. Suppress the transition for the measurement.
                var prevTransition = pane.style.transition;
                pane.style.transition = 'none';
                var before = pane.getBoundingClientRect().width;
                exp.click();
                void pane.offsetWidth;                        // force reflow
                w.expandAddsClass = pane.classList.contains('expanded');
                w.widthBefore = Math.round(before);
                w.widthAfter = Math.round(pane.getBoundingClientRect().width);
                w.expandWidens = w.widthAfter > w.widthBefore;
                var titleEl = pane.querySelector('.doc-title-text');
                w.expandUnwrapsTitles = titleEl
                  ? getComputedStyle(titleEl).whiteSpace === 'normal'
                  : null;
                exp.click();                       // leave it as we found it
                void pane.offsetWidth;
                pane.style.transition = prevTransition;
              }
              w.contrast = contrastFailures();
              out.workspace = w;
            } catch (e) {
              out.workspace = { error: String(e && e.message || e) };
            }
            emit(out);
          }, 2500);
        }
      } catch (e) {
        out.fatal = String(e && e.message || e);
      }
      if (!deferred) emit(out);
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
             # Pin the viewport. Headless Chrome defaults to 800x600, which is
             # below the 900px breakpoint where the workspace deliberately
             # stacks and the sidebar goes full width - so the layout
             # assertions were measuring the mobile layout and reporting the
             # expand toggle as broken. Responsive behaviour deserves its own
             # pass rather than being the accidental default.
             "--window-size=1440,900",
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
    # Fetch a real document id rather than hardcoding one. This used to assert
    # /api/document/42, which silently became a 404 the moment re-indexing
    # removed that row - a failing test that pointed at nothing.
    # Scraped with a regex, not json.loads: http() caps the body at 80 KB and a
    # full search response is larger, so parsing the truncated text would fail.
    code, body = http(base + "/api/search?q=connector&product=xpi")
    m = re.search(r'"id"\s*:\s*(\d+)', body) if code == 200 else None
    doc_id = int(m.group(1)) if m else None
    if doc_id is None:
        record(False, "public  /api/document/<id>", "could not resolve a document id from search")
    else:
        code, _ = http(f"{base}/api/document/{doc_id}")
        record(code == 200, f"public  /api/document/<id> (resolved {doc_id})", f"HTTP {code}")

    token = login(base)
    if not record(bool(token), "login as admin"):
        return
    for path in AUTHED_ENDPOINTS:
        code, body = http(base + path, token=token)
        record(code == 200, f"authed  {path}", f"HTTP {code} {body[:90] if code == 0 else ''}")
    code, _ = http(base + "/api/favorites")
    record(code == 401, "authed endpoint rejects anonymous", f"HTTP {code} (want 401)")

    # The AI provider config is admin-only to write, but the GET was public and
    # returned the masked provider key (its first six and last four characters)
    # plus the whole system prompt. Anonymous callers get provider and model
    # only - the Copilot engine badge needs those and nothing else.
    code, body = http(base + "/api/ai/settings")
    try:
        payload = json.loads(body) if code == 200 else {}
    except ValueError:
        payload = {}
    secret = [k for k in ("masked_api_key", "system_prompt", "api_base_url", "temperature")
              if k in payload]
    record(code == 200 and not secret,
           "anonymous AI settings withhold key and prompt",
           f"HTTP {code}, exposed: {', '.join(secret) or 'none'}")
    for path in ("/api/ai/settings", "/api/ai/test-connection"):
        code, _ = http(base + path, data=b"{}")
        record(code in (401, 403), f"anonymous cannot write {path}", f"HTTP {code}")

    # Pinning is a global flag: it adds +20 to the search score, puts the
    # document on the landing page and into the Pinned SOPs rail. Neither of
    # these endpoints took a session at all, so an anonymous POST could promote
    # any document for every visitor, and repeat it.
    #
    # Aimed at an id that does not exist, so the check cannot mutate anything
    # even when it fails - an earlier version used a live id and, under a
    # deliberately broken build, left two likes behind. The auth dependency is
    # evaluated before the document lookup, which is what makes this work:
    # no session gives 401, a real session gives 404.
    GHOST = 999999999
    for ep in ("pin", "like"):
        code, _ = http(f"{base}/api/document/{GHOST}/{ep}", data=b"")
        record(code in (401, 403),
               f"anonymous cannot POST /api/document/<id>/{ep}", f"HTTP {code}")
        code, _ = http(f"{base}/api/document/{GHOST}/{ep}", data=b"",
                       token="not.a.real.jwt")
        record(code in (401, 403),
               f"a bogus token cannot POST /api/document/<id>/{ep}", f"HTTP {code}")
        # Without this the 401s above would also pass if the route had been
        # deleted or were rejecting everyone: a real session must get past the
        # auth gate and fail on the missing document instead.
        code, _ = http(f"{base}/api/document/{GHOST}/{ep}", data=b"", token=token)
        record(code == 404,
               f"a real session reaches /api/document/<id>/{ep}",
               f"HTTP {code} (want 404 for a missing document)")


SCRIPT_SRC_RE = re.compile(r'<script[^>]+src="(https://[^"]+)"')


def check_vendor_urls() -> None:
    """Every third-party <script> must name an exact version and must resolve.

    Both halves have already bitten this project. An unpinned jsDelivr path
    silently resolves to whatever version still ships that filename, so the app
    can change underneath you with no commit; and a pin typed from the registry
    without checking can point at a release that never published that file,
    which 404s with no visible error beyond a missing global.

    Google Fonts is deliberately not checked - its css2 endpoint is versionless
    by design and negotiates formats per browser.
    """
    print("\nVendor scripts")
    src = open(os.path.join(FRONTEND, "index.html"), encoding="utf-8").read()
    urls = sorted(set(SCRIPT_SRC_RE.findall(src)))
    if not urls:
        record(True, "no third-party scripts referenced")
        return

    codes = []
    for url in urls:
        pkg = (url.split("/npm/", 1)[1] if "/npm/" in url else url.split("/", 4)[3]).split("/")[0]
        # "@" alone is not a version: lucide@latest contains one and still
        # floats. A pin has to name something immutable.
        ver = pkg.rsplit("@", 1)[1] if "@" in pkg.lstrip("@") else ""
        pinned = bool(ver) and ver[0].isdigit()
        record(pinned, f"pinned  {pkg}",
               "floating - the CDN picks the version, so behaviour can change without a commit")
        code, detail = http(url, timeout=25, retries=1)
        codes.append(code)
        if code == 0:
            continue                      # offline; reported once below
        record(code == 200, f"resolves  {pkg}", f"HTTP {code} for {url}")

    if codes and all(c == 0 for c in codes):
        print("  SKIP  no network - could not confirm the CDN URLs resolve")


# Markup that a browser parses differently from BeautifulSoup's html.parser.
# Each of these hides an onerror handler inside something html.parser calls a
# comment, so find_all(True) never visits it and the attribute scrubber never
# runs - while the browser ends the comment early and the <img> goes live.
# The first two were demonstrated executing after sanitising; the rest are the
# same shape. Verified end to end by assigning the sanitised output via
# innerHTML in headless Chrome, which is what app.js:2335 does with it.
MXSS_PAYLOADS = [
    "<!--><img src=x onerror=alert(1)>-->",
    "<svg><desc><![CDATA[</desc><img src=x onerror=alert(1)>]]></desc></svg>",
    "<svg><!--><circle/></svg><img src=x onerror=alert(1)>-->",
    "<!--- --><img src=x onerror=alert(1)>",
    "<!--> --><img src=x onerror=alert(1)>",
    "<!foo><img src=x onerror=alert(1)>",
    "<?foo><img src=x onerror=alert(1)>",
    "<![CDATA[<img src=x onerror=alert(1)>]]>",
    "<!DOCTYPE html><img src=x onerror=alert(1)>",
    "<img src=x onerror=alert(1)>",
    "<script>alert(1)</script>",
    '<iframe srcdoc="&lt;img src=x onerror=alert(1)&gt;"></iframe>',
]

# Markup that must come through intact - a sanitiser that eats real content is
# its own kind of failure.
SANITIZER_KEEPS = [
    ("<h2>Steps</h2>", "h2"),
    ('<a href="https://example.com">here</a>', "href"),
    ("<table><tr><td>cell</td></tr></table>", "<td>"),
    ('<img src="/uploads/shot.png" alt="shot">', "/uploads/shot.png"),
    ("<p>Open <b>Studio</b></p>", "<b>"),
]


def check_sanitizer() -> None:
    """Document HTML is assigned straight to innerHTML with no client-side
    sanitising, so this server-side function is the only gate."""
    print("\nHTML sanitizer")
    sys.path.insert(0, REPO)
    try:
        from backend.main import sanitize_html_fragment, _COMMENT_LIKE
    except Exception as e:
        record(False, "import sanitize_html_fragment", f"{type(e).__name__}: {e}")
        return

    # backend.database also exports a Comment ORM model. Importing bs4's Comment
    # unaliased lets that shadow it, which silently empties this tuple of the one
    # node type that matters - the sanitiser then looks correct and strips
    # nothing. That exact mistake was made and only caught by re-running the
    # browser check, so assert the types rather than trusting the import order.
    wrong = [t.__name__ for t in _COMMENT_LIKE
             if getattr(t, "__module__", "").split(".")[0] != "bs4"]
    record(not wrong, "sanitizer comment types all come from bs4",
           f"not bs4: {wrong}")

    for raw in MXSS_PAYLOADS:
        out = (sanitize_html_fragment(raw) or "").lower()
        bad = [s for s in ("onerror", "onload", "<script", "javascript:", "srcdoc")
               if s in out]
        record(not bad, f"sanitised: {raw[:46]}", f"survived: {bad} -> {out[:70]}")

    for markup, needle in SANITIZER_KEEPS:
        out = sanitize_html_fragment(markup) or ""
        record(needle in out, f"kept legitimate markup: {needle}", f"got {out[:70]}")

    # Comments themselves must not survive - that is what closed the hole.
    out = sanitize_html_fragment("<p>a</p><!-- note --><p>b</p>") or ""
    record("<!--" not in out and "<p>a</p>" in out and "<p>b</p>" in out,
           "comments stripped, surrounding content kept", out[:70])

    # RoboHelp spec tables take a different route: format_robohelp_topic_html
    # builds its own markup and the caller assigns it WITHOUT passing it through
    # sanitize_html_fragment. It is safe because every field comes from
    # get_text() and is then html.escape()d - audited and confirmed inert in a
    # real browser - but nothing structural enforces that, so pin it here.
    try:
        from bs4 import BeautifulSoup as _BS
        from backend.main import format_robohelp_topic_html
    except Exception as e:
        record(False, "import format_robohelp_topic_html", f"{type(e).__name__}: {e}")
        return
    # Two shapes. Raw markup is dropped by get_text() because an <img> carries no
    # text - correct, and not what this guards. The entity-encoded form is the
    # real case: a spec table that documents "DbDel(<generic table>)" is text
    # that looks like markup, and it must come back escaped rather than live.
    payload = ("&lt;img src=x onerror=alert(1)&gt; <img src=y onerror=alert(2)> "
               "\" onmouseover=alert(3) x=\" <script>alert(4)</script>")
    fixture = (
        "<html><body><table>"
        f"<tr><td colspan='2'>Overview {payload}</td></tr>"
        f"<tr><td>Syntax:</td><td>{payload}</td></tr>"
        f"<tr><td>Parameters:</td><td>pname - {payload}</td></tr>"
        f"<tr><td>Returns:</td><td>{payload}</td></tr>"
        f"<tr><td>Notes:</td><td>{payload}</td></tr>"
        f"<tr><td>Example:</td><td>{payload}</td></tr>"
        "</table></body></html>")
    built = format_robohelp_topic_html(_BS(fixture, "html.parser"), "T") or ""
    record(bool(built), "RoboHelp formatter produced a view", f"{len(built)} chars")
    if built:
        # The formatter's own Copy button carries a legitimate onclick, so count
        # elements rather than substrings: no tag may be built from the payload.
        rendered = _BS(built, "html.parser")
        injected = [t.name for t in rendered.find_all(["img", "script", "iframe"])]
        record(not injected, "RoboHelp formatter injects no tags from field text",
               f"built: {injected}")
        stray = [t.name for t in rendered.find_all(True)
                 if any(a.lower().startswith("on") for a in t.attrs)
                 and t.name != "button"]
        record(not stray, "RoboHelp formatter leaks no on* handlers", f"on {stray}")
        # It must escape the payload, not silently drop it: the reader should
        # still see what the source document said, rendered literally.
        # Checked as the output's *text*, not as a substring - a substring test
        # passes for the wrong reason, because the Copy button's onclick escapes
        # its value separately and keeps an "&lt;img" in the string even when
        # every display field has been left raw.
        record("<img src=x onerror=alert(1)>" in rendered.get_text(),
               "RoboHelp formatter renders payload as escaped text",
               "payload did not survive as literal text")


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
        v = r.get("vendors") or {}
        for lib in ("lucide", "marked", "chart"):
            record(v.get(lib) is True, f"{who}: {lib} loaded and working", str(v.get(lib)))
        if not authed:
            record(r.get("copilotSettingsPaneShown") is False,
                   "guest: Copilot does not open on the settings pane",
                   str(r.get("copilotSettingsPaneShown")))
            record(r.get("copilotSettingsBtnShown") is False,
                   "guest: Copilot settings tab hidden",
                   str(r.get("copilotSettingsBtnShown")))
        bad_icons = r.get("unrenderedIcons")
        record(bad_icons == [], f"{who}: every lucide icon name resolves",
               f"{len(bad_icons or [])} unknown -> " + ", ".join(sorted(set(bad_icons or []))[:5]))
        w = r.get("workspace") or {}
        if w.get("error"):
            record(False, f"{who}: workspace probe ran", w["error"])
        elif w:
            record(w.get("visible") is True, f"{who}: opening a space shows the workspace")
            # The right rail is an optional layout. Where it is absent the
            # personal lists legitimately live in the left pane, so assert its
            # internals only when the rail is actually present - otherwise
            # these would be three permanent failures describing a design
            # choice rather than a defect.
            has_rail = (w.get("rightPanes") or 0) > 0
            record(w.get("leftPanes") == 1,
                   f"{who}: workspace has exactly one left pane",
                   f"left={w.get('leftPanes')}")
            record(w.get("treeInLeftPane") is True,
                   f"{who}: space tree is in the left pane")
            record((w.get("treeItems") or 0) > 0,
                   f"{who}: space tree populated", str(w.get("treeItems")))
            if has_rail:
                record(len(w.get("railPanels") or []) == 3,
                       f"{who}: Pinned/Favourites/Bookmarks are in the right rail",
                       str(w.get("railPanels")))
                record(not w.get("strayInLeftPane"),
                       f"{who}: no sidebar panel left behind in the left pane",
                       str(w.get("strayInLeftPane")))
            else:
                print(f"  SKIP  {who}: no right rail in this layout "
                      f"(personal lists are in the left pane)")
            record(w.get("expandAddsClass") is True and w.get("expandWidens") is True,
                   f"{who}: sidebar expand toggle widens the pane",
                   f"class={w.get('expandAddsClass')} {w.get('widthBefore')}px -> {w.get('widthAfter')}px")
            record(w.get("expandUnwrapsTitles") is True,
                   f"{who}: expanding unwraps document titles",
                   str(w.get("expandUnwrapsTitles")))
            wbad = w.get("contrast") or []
            record(not wbad, f"{who}: workspace text contrast >= AA",
                   f"{len(wbad)} below 3:1 -> " + "; ".join(wbad[:3]))
        else:
            record(False, f"{who}: workspace probe ran", "no workspace data returned")

        k = r.get("kbFooter") or {}
        if k.get("groups"):
            record(k.get("sameRow") is True and (k.get("gap") or 0) > 16,
                   f"{who}: KB footer groups sit apart on one row",
                   f"sameRow={k.get('sameRow')} gap={k.get('gap')}px")
            record(not k.get("squeezed"),
                   f"{who}: no KB footer button is squeezed below its content",
                   str(k.get("squeezed")))
            record(k.get("opens") is True and k.get("closedAtRest") is True
                   and k.get("closesAgain") is True,
                   f"{who}: Templates menu opens and closes",
                   f"rest={k.get('closedAtRest')} opens={k.get('opens')} "
                   f"closes={k.get('closesAgain')}")
            record(k.get("opensUpward") is True and k.get("insideModal") is True,
                   f"{who}: Templates menu opens upward, inside the modal",
                   f"up={k.get('opensUpward')} inside={k.get('insideModal')}")
            record(k.get("itemCount") == 4 and k.get("wrappedItems") == 0
                   and k.get("insertWired") is True,
                   f"{who}: 4 template options, each on one line, wired up",
                   f"items={k.get('itemCount')} wrapped={k.get('wrappedItems')} "
                   f"wired={k.get('insertWired')}")
            record(k.get("toolbarStillDown") is True,
                   f"{who}: toolbar menus still drop downward")
        else:
            print(f"  SKIP  {who}: no KB studio footer in this layout")

        errs = r.get("consoleErrors") or []
        record(not errs, f"{who}: no console errors", "; ".join(errs[:3]))
        bad = r.get("contrast") or []
        record(not bad, f"{who}: landing text contrast >= AA", f"{len(bad)} below 3:1 -> " + "; ".join(bad[:3]))


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
        check_vendor_urls()
        check_sanitizer()
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
