"""Phase 3 verification — guided entry modal, recents endpoint, all paths."""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from db import init_db, get_db
from app import create_app

BASE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE, "test_timelog.db")
WEB_ROOT = os.path.join(BASE, "web")
CFG = {"port": 5150, "db_path": "test_timelog.db", "web_root": WEB_ROOT}

if os.path.exists(DB_PATH):
    os.remove(DB_PATH)

init_db(DB_PATH)

# Seed some recents data
conn = get_db(DB_PATH)
conn.executemany(
    "INSERT INTO TimeLogTable (uid, date, job, time, e_time, memo, device, qty) VALUES (?,?,?,?,?,?,?,?)",
    [
        ("u1", "05/10/2026", "project", "08:00:00 AM", "1:00:00", "Inventory Scanner App", None, None),
        ("u2", "05/11/2026", "project", "09:00:00 AM", "2:00:00", "Badge Printer Setup", None, None),
        ("u3", "05/12/2026", "admin", "10:00:00 AM", "0:30:00", "Email cleanup", None, None),
        ("u4", "05/12/2026", "project", "11:00:00 AM", "1:00:00", "Inventory Scanner App", None, None),
    ]
)
conn.commit()
conn.close()

app = create_app(CFG, WEB_ROOT, DB_PATH, share_ok=True)
client = app.test_client()
errors = []

# 1. /api/recents/project returns distinct memos
r = client.get("/api/recents/project")
data = r.get_json()
if "Inventory Scanner App" not in data or "Badge Printer Setup" not in data:
    errors.append(f"recents/project missing items: {data}")
elif len(data) != 2:
    errors.append(f"recents/project should have 2 distinct, got {len(data)}")
else:
    print(f"[PASS] /api/recents/project: {data}")

# 2. /api/recents/admin
r = client.get("/api/recents/admin")
data = r.get_json()
if data != ["Email cleanup"]:
    errors.append(f"recents/admin unexpected: {data}")
else:
    print(f"[PASS] /api/recents/admin: {data}")

# 3. /api/recents for type with no data returns empty
r = client.get("/api/recents/meeting")
if r.get_json() != []:
    errors.append("recents/meeting should be empty")
else:
    print("[PASS] /api/recents/meeting: [] (empty)")

# 4. guided.js is served
r = client.get("/js/guided.js")
if r.status_code != 200 or b"Guided" not in r.data:
    errors.append("guided.js not served")
else:
    print("[PASS] js/guided.js served")

# 5. index.html includes guided.js
r = client.get("/")
if b"guided.js" not in r.data:
    errors.append("index.html missing guided.js")
else:
    print("[PASS] index.html includes guided.js")

# 6. CSS has guided styles
r = client.get("/css/app.css")
if b"guided-overlay" not in r.data:
    errors.append("app.css missing guided styles")
else:
    print("[PASS] css/app.css has guided modal styles")

# Cleanup
os.remove(DB_PATH)

if errors:
    print(f"\nFAILURES: {errors}")
    sys.exit(1)
else:
    print("\nPhase 3 verification PASSED - guided entry modal and recents API working.")
