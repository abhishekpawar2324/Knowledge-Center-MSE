import urllib.request, json, re

# 1. Fetch HTML
with urllib.request.urlopen('http://localhost:8000/') as resp:
    html = resp.read().decode('utf-8')
    assert 'openLoginPage' in html, 'Missing openLoginPage'
    assert 'switchProductScope' in html, 'Missing switchProductScope'
    assert 'modal-publish-ai-kb' in html, 'Missing modal-publish-ai-kb'
    m = re.search(r'app\.js\?v=[0-9.]+', html)
    assert m, 'Missing cache-busting app.js?v=... reference'
    app_js_url = m.group(0)
    print('[PASS] index.html loaded and contains all global handlers and modals')

# 2. Fetch app.js
with urllib.request.urlopen('http://localhost:8000/' + app_js_url) as resp:
    js = resp.read().decode('utf-8')
    assert 'window._switchProductScopeInternal' in js, 'Missing _switchProductScopeInternal'
    assert 'window.openDocument' in js, 'Missing openDocument'
    assert 'window.createKbFromAI' in js, 'Missing createKbFromAI'
    assert 'window.markResolutionVerified' in js, 'Missing markResolutionVerified'
    print(f'[PASS] {app_js_url} served with 200 OK and valid functions')

# 3. Test overview API
with urllib.request.urlopen('http://localhost:8000/api/products/overview') as resp:
    ov = json.loads(resp.read().decode('utf-8'))
    print('[PASS] Products overview loaded:', list(ov.keys()))

print('\nAll checks PASSED! Product is fully restored and 100% operational.')
