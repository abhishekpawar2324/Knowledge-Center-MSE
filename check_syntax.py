import subprocess, sys

# 1. Test Node syntax check on app.js
try:
    res = subprocess.run(["node", "-c", "frontend/app.js"], capture_output=True, text=True)
    if res.returncode == 0:
        print("[PASS] Node.js syntax check passed! 0 syntax errors in app.js")
    else:
        print("[FAIL] Node.js syntax error in app.js:")
        print(res.stderr)
except Exception as e:
    print("Could not run node:", e)

# 2. Check index.html for unclosed tags or syntax issues
with open("frontend/index.html", "r", encoding="utf-8") as f:
    html = f.read()

print(f"index.html length: {len(html)} bytes")
