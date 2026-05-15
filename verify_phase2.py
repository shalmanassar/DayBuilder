"""Phase 2 verification — tests timeline rendering, API persistence, block CRUD."""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from db import init_db
from app import create_app

BASE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE, "test_timelog.db")
WEB_ROOT = os.path.join(BASE, "web")
CFG = {"port": 5150, "db_path": "test_timelog.db", "web_root": WEB_ROOT}

if os.path.exists(DB_PATH):
    os.remove(DB_PATH)

init_db(DB_PATH)
app = create_app(CFG, WEB_ROOT, DB_PATH, share_ok=True)
client = app.test_client()
errors = []

# 1. index.html includes timeline.js
r = client.get("/")
if b"timeline.js" not in r.data:
    errors.append("index.html missing timeline.js script tag")
else:
    print("[PASS] index.html includes timeline.js")

# 2. timeline.js is served
r = client.get("/js/timeline.js")
if r.status_code != 200 or b"Timeline" not in r.data:
    errors.append("timeline.js not served or missing Timeline object")
else:
    print("[PASS] js/timeline.js served correctly")

# 3. CSS includes timeline styles
r = client.get("/css/app.css")
if b"tl-block" not in r.data:
    errors.append("app.css missing timeline styles")
else:
    print("[PASS] css/app.css has timeline styles")

# 4. Save multiple blocks, read back, verify order
blocks = [
    {"id": "b1", "type": "clock_in", "start": "07:00", "end": "07:00"},
    {"id": "b2", "type": "asset_processing", "device": "ZebraTC", "qty": 4, "start": "07:00", "end": "09:15", "memo": "test"},
    {"id": "b3", "type": "break", "start": "09:15", "end": "09:30"},
    {"id": "b4", "type": "asset_processing", "device": "ZebraMC", "qty": 2, "start": "09:30", "end": "11:00"},
]
r = client.post("/api/day/2026-05-15", json={"blocks": blocks})
assert r.get_json()["ok"]

r = client.get("/api/day/2026-05-15")
data = r.get_json()
if len(data["blocks"]) != 4:
    errors.append(f"Expected 4 blocks, got {len(data['blocks'])}")
else:
    print(f"[PASS] Saved and loaded 4 blocks")

# 5. Verify block fields preserved
b2 = next(b for b in data["blocks"] if b["id"] == "b2")
if b2["device"] != "ZebraTC" or b2["qty"] != 4 or b2["memo"] != "test":
    errors.append(f"Block fields not preserved: {b2}")
else:
    print("[PASS] Block fields preserved (device, qty, memo)")

# 6. Delete and verify
r = client.delete("/api/day/2026-05-15")
assert r.get_json()["ok"]
r = client.get("/api/day/2026-05-15")
if r.get_json()["blocks"] != []:
    errors.append("Delete didn't clear")
else:
    print("[PASS] Delete clears all blocks")

# Cleanup
os.remove(DB_PATH)

if errors:
    print(f"\nFAILURES: {errors}")
    sys.exit(1)
else:
    print("\nPhase 2 verification PASSED - timeline rendering and API wired.")
