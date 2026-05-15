"""Phase 1 verification — tests bootstrap, Flask serving, and API CRUD."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from db import init_db
from app import create_app
import json

BASE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE, "test_timelog.db")
WEB_ROOT = os.path.join(BASE, "web")
CFG = {"port": 5150, "db_path": "test_timelog.db", "web_root": WEB_ROOT}

# Clean slate
if os.path.exists(DB_PATH):
    os.remove(DB_PATH)

init_db(DB_PATH)
app = create_app(CFG, WEB_ROOT, DB_PATH, share_ok=True)
client = app.test_client()

errors = []

# 1. Serve index.html
r = client.get("/")
if r.status_code != 200 or b"DayBuilder" not in r.data:
    errors.append(f"GET / failed: {r.status_code}")
else:
    print("[PASS] GET / serves index.html")

# 2. GET /api/status
r = client.get("/api/status")
data = r.get_json()
if not data.get("db_ok"):
    errors.append(f"/api/status db_ok=False")
else:
    print(f"[PASS] GET /api/status: {data}")

# 3. GET /api/config
r = client.get("/api/config")
data = r.get_json()
if "shared" not in data or "device_types" not in data["shared"]:
    errors.append(f"/api/config missing shared data")
else:
    print(f"[PASS] GET /api/config: {len(data['shared']['device_types'])} device types")

# 4. POST /api/day/2026-05-15 (save blocks)
blocks = [
    {"id": "test1", "type": "asset_processing", "device": "ZebraTC", "qty": 4,
     "start": "07:00", "end": "09:15", "memo": "test block"}
]
r = client.post("/api/day/2026-05-15", json={"blocks": blocks})
if r.get_json().get("ok") != True:
    errors.append("POST /api/day failed")
else:
    print("[PASS] POST /api/day/2026-05-15")

# 5. GET /api/day/2026-05-15 (read back)
r = client.get("/api/day/2026-05-15")
data = r.get_json()
if len(data["blocks"]) != 1 or data["blocks"][0]["device"] != "ZebraTC":
    errors.append(f"GET /api/day returned wrong data: {data}")
else:
    print(f"[PASS] GET /api/day/2026-05-15: {data['blocks'][0]['type']} · {data['blocks'][0]['device']}")

# 6. DELETE /api/day/2026-05-15
r = client.delete("/api/day/2026-05-15")
if r.get_json().get("ok") != True:
    errors.append("DELETE /api/day failed")
r = client.get("/api/day/2026-05-15")
if r.get_json()["blocks"] != []:
    errors.append("DELETE didn't clear blocks")
else:
    print("[PASS] DELETE /api/day/2026-05-15")

# Cleanup
os.remove(DB_PATH)

if errors:
    print(f"\nFAILURES: {errors}")
    sys.exit(1)
else:
    print("\nPhase 1 verification PASSED - all endpoints working.")
