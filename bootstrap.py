"""DayBuilder bootstrap — Flask server, browser launch, embedded setup page."""
import os
import sys
import json
import shutil
import webbrowser
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

if getattr(sys, 'frozen', False):
    BASE_DIR = Path(sys.executable).parent.resolve()
else:
    BASE_DIR = Path(__file__).parent.resolve()
CONFIG_PATH = BASE_DIR / "config.json"
LOG_PATH = BASE_DIR / "daybuilder.log"
CACHE_DIR = BASE_DIR / "cache"

# --- Logging ---
logger = logging.getLogger("daybuilder")
logger.setLevel(logging.DEBUG if "--debug" in sys.argv else logging.INFO)
handler = RotatingFileHandler(LOG_PATH, maxBytes=5*1024*1024, backupCount=5)
handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
logger.addHandler(handler)


def load_config():
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH) as f:
            return json.load(f)
    return {}


def save_config(cfg):
    with open(CONFIG_PATH, "w") as f:
        json.dump(cfg, f, indent=2)


def show_splash():
    """Dumb launch indicator — no interaction, closes when browser opens."""
    try:
        import tkinter as tk
        splash = tk.Tk()
        splash.title("DayBuilder")
        splash.configure(bg="#123d52")
        splash.geometry("340x100+500+300")
        splash.overrideredirect(True)
        splash.attributes("-topmost", True)
        tk.Label(splash, text="☀ RMA Job Tracking", font=("Segoe UI", 13, "bold"),
                 fg="#e8f4f8", bg="#123d52").pack(pady=(22, 4))
        tk.Label(splash, text="Opening browser...", font=("Segoe UI", 9),
                 fg="#8ab4c7", bg="#123d52").pack()
        splash.update()
        return splash
    except Exception:
        return None


def resolve_web_root(cfg):
    """Determine web_root: config value, or fallback to local web/ for dev."""
    web_root = cfg.get("web_root")
    if web_root and os.path.isdir(web_root):
        return web_root
    local_web = BASE_DIR / "web"
    if local_web.is_dir():
        return str(local_web)
    return None


def check_share(web_root):
    if not web_root:
        return False
    return os.path.isfile(os.path.join(web_root, "shared_config.json"))


def sync_cache(web_root):
    try:
        if CACHE_DIR.exists():
            shutil.rmtree(CACHE_DIR)
        shutil.copytree(web_root, CACHE_DIR)
        logger.info("Cache synced from share.")
    except Exception as e:
        logger.warning(f"Cache sync failed: {e}")


def get_version(web_root):
    ver_path = os.path.join(web_root, "version.json")
    if os.path.isfile(ver_path):
        with open(ver_path) as f:
            return json.load(f).get("version", "0.0.0")
    return "0.0.0"


def cache_is_stale(web_root):
    share_ver = get_version(web_root)
    cache_ver = get_version(str(CACHE_DIR))
    return share_ver != cache_ver


# --- Embedded Setup HTML (served from memory, no file dependency) ---
SETUP_HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>DayBuilder — Setup</title>
<style>
:root{--bg-deep:#02090f;--bg-header:#123d52;--bg-card:#1a2a35;--bg-surface:#1e3a4a;--text-primary:#e8f4f8;--text-muted:#8ab4c7;--accent:#3498db;--accent-hover:#2980b9;--success:#27ae60;--warning:#f39c12;--danger:#e74c3c;--border:#2c4a5a}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg-deep);color:var(--text-primary);min-height:100vh;display:flex;align-items:center;justify-content:center}
.setup-container{max-width:480px;width:100%;padding:2rem;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;position:relative}
.setup-container h1{margin-bottom:0.5rem}
.setup-container p.sub{color:var(--text-muted);margin-bottom:1.5rem}
.setup-step{display:none}.setup-step.active{display:block}
.setup-label{display:block;color:var(--text-muted);font-size:0.85rem;margin-bottom:0.3rem}
.setup-input{width:100%;padding:0.6rem;margin-bottom:1rem;background:var(--bg-deep);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);font-size:1rem}
.setup-row{display:flex;gap:0.5rem;align-items:center;margin-bottom:1rem}
.setup-row .setup-input{flex:1;margin-bottom:0}
.setup-browse{padding:0.6rem 1rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);cursor:pointer;white-space:nowrap}
.setup-browse:hover{background:var(--accent)}
.setup-btn{width:100%;padding:0.75rem;margin-top:0.5rem;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer}
.setup-btn:hover{background:var(--accent-hover)}
.setup-btn:disabled{opacity:0.5;cursor:not-allowed}
.setup-back{background:none;border:none;color:var(--text-muted);cursor:pointer;margin-top:0.5rem}
.setup-back:hover{color:var(--text-primary)}
.file-list{display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:1rem}
.file-opt{padding:0.5rem 1rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:6px;cursor:pointer;color:var(--text-primary);font-size:0.9rem}
.file-opt:hover,.file-opt.selected{background:var(--accent);border-color:var(--accent)}
.sheet-list{display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:1rem}
.sheet-opt{padding:0.5rem 1rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:6px;cursor:pointer;color:var(--text-primary)}
.sheet-opt:hover,.sheet-opt.selected{background:var(--accent);border-color:var(--accent)}
.schedule-grid{display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:1rem}
.schedule-grid label{font-size:0.8rem;color:var(--text-muted)}
.schedule-grid input{width:100%;padding:0.4rem;background:var(--bg-deep);border:1px solid var(--border);border-radius:4px;color:var(--text-primary)}
.setup-error{color:var(--danger);font-size:0.85rem;margin-bottom:0.5rem}
.setup-info{color:var(--text-muted);font-size:0.8rem;margin-bottom:0.5rem}
</style>
</head>
<body>
<div class="setup-container">
<h1>&#9728; DayBuilder Setup</h1>
<button onclick="fetch('/api/shutdown',{method:'POST'}).then(()=>{document.body.innerHTML='<div style=text-align:center;padding:4rem;color:#8ab4c7><h1>Closed</h1></div>'})" style="position:absolute;top:1rem;right:1rem;background:none;border:1px solid var(--border);color:var(--danger);padding:0.3rem 0.7rem;border-radius:4px;cursor:pointer">✕ Exit</button>
<p class="sub">Let's get you configured.</p>

<!-- Step 1: Username -->
<div class="setup-step active" id="step1">
  <label class="setup-label">Your username (login name)</label>
  <input class="setup-input" id="userId" placeholder="e.g. jsmith" autofocus>
  <label class="setup-label">Display name</label>
  <input class="setup-input" id="displayName" placeholder="e.g. Charles">
  <button class="setup-btn" id="btn1">Next &#8594;</button>
</div>

<!-- Step 2: RMAJobLogger folder -->
<div class="setup-step" id="step2">
  <label class="setup-label">Select the RMAJobLogger folder on the shared drive</label>
  <p class="setup-info">This lets the app find shared resources and sync your data.</p>
  <div class="setup-row">
    <input class="setup-input" id="rmaFolder" placeholder="Browse or paste path to RMAJobLogger folder...">
    <button class="setup-browse" id="browseRma">Browse</button>
  </div>
  <p class="setup-info" id="rmaStatus"></p>
  <div class="setup-error" id="rmaError"></div>
  <button class="setup-btn" id="btn2">Next &#8594;</button>
  <button class="setup-back" id="back2">&#8592; Back</button>
  <button class="setup-back" id="skip2" style="margin-left:0.5rem;color:var(--warning)">Skip (offline/dev)</button>
</div>

<!-- Step 3: Manager's Tech Reports folder -->
<div class="setup-step" id="step3">
  <label class="setup-label">Select your Manager's Tech Reports folder</label>
  <p class="setup-info">This is where your weekly productivity workbook lives.</p>
  <div class="setup-row">
    <input class="setup-input" id="reportsFolder" placeholder="Browse or paste path to folder...">
    <button class="setup-browse" id="browseReports">Browse</button>
  </div>
  <div class="setup-error" id="reportsError"></div>
  <div class="file-list" id="fileList"></div>
  <button class="setup-btn" id="btn3" disabled>Next &#8594;</button>
  <button class="setup-back" id="back3">&#8592; Back</button>
</div>

<!-- Step 4: Sheet select -->
<div class="setup-step" id="step4">
  <label class="setup-label">Select your sheet</label>
  <p class="setup-info" id="sheetInfo">Loading sheets...</p>
  <div class="sheet-list" id="sheetList"></div>
  <div class="setup-error" id="sheetError"></div>
  <button class="setup-btn" id="btn4">Next &#8594;</button>
  <button class="setup-back" id="back4">&#8592; Back</button>
</div>

<!-- Step 5: Schedule -->
<div class="setup-step" id="step5">
  <label class="setup-label">Confirm your default schedule</label>
  <div class="schedule-grid">
    <div><label>Start time</label><input type="time" id="schedStart" value="07:00"></div>
    <div><label>End time</label><input type="time" id="schedEnd" value="16:30"></div>
    <div><label>Break count</label><input type="number" id="schedBreaks" value="2" min="0" max="4"></div>
    <div><label>Break (min)</label><input type="number" id="schedBreakMin" value="15" min="5" max="60"></div>
    <div><label>Lunch (min)</label><input type="number" id="schedLunch" value="30" min="15" max="60"></div>
  </div>
  <button class="setup-btn" id="btn5">Finish Setup &#10003;</button>
  <button class="setup-back" id="back5">&#8592; Back</button>
</div>

<!-- Done -->
<div class="setup-step" id="stepDone">
  <h2 style="color:var(--success)">&#10003; Setup Complete</h2>
  <p style="margin-top:0.5rem;color:var(--text-muted)">Redirecting to your day view...</p>
</div>
</div>

<script>
(async function(){
  const state = {};
  let selectedFile = null, selectedSheet = null, reportsPath = '';

  function show(id){
    document.querySelectorAll('.setup-step').forEach(s=>s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  // Pre-fill username from config (auto-populated by bootstrap)
  try {
    const res = await fetch('/api/config');
    const cfg = await res.json();
    if(cfg.user && cfg.user.user_id) document.getElementById('userId').value = cfg.user.user_id;
    if(cfg.user && cfg.user.user_display_name) document.getElementById('displayName').value = cfg.user.user_display_name;
  } catch(e){}

  // Step 1 -> 2
  document.getElementById('btn1').onclick = ()=>{
    const uid = document.getElementById('userId').value.trim();
    if(!uid) return;
    state.user_id = uid;
    state.user_display_name = document.getElementById('displayName').value.trim() || uid;
    show('step2');
  };

  // Step 2: RMAJobLogger folder
  document.getElementById('browseRma').onclick = async ()=>{
    const startPath = 'W:\\Team Spaces\\RAD IT Engineering\\NA RAD IT Engineering';
    const res = await fetch('/api/browse',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({type:'folder',title:'Select the RMAJobLogger folder',initial_dir:startPath})});
    const data = await res.json();
    if(!data.path) return;
    document.getElementById('rmaFolder').value = data.path;
    state.web_root = data.path.replace(/\//g,'\\') + '\\DayBuilder\\web';
    state.sync_target = data.path.replace(/\//g,'\\') + '\\POST';
    document.getElementById('rmaStatus').textContent = '\u2713 Found: ' + data.path;
    document.getElementById('rmaError').textContent = '';
  };

  document.getElementById('btn2').onclick = ()=>{
    if(!document.getElementById('rmaFolder').value && !state.web_root){
      document.getElementById('rmaError').textContent = 'Browse to select a folder, or click Skip.';
      return;
    }
    show('step3');
  };
  document.getElementById('skip2').onclick = ()=>{ show('step3'); };
  document.getElementById('back2').onclick = ()=> show('step1');

  // Step 3: Browse Tech Reports folder
  document.getElementById('browseReports').onclick = async ()=>{
    const startPath = 'W:\\Team Spaces\\RAD IT Engineering\\NA RAD IT Engineering';
    const res = await fetch('/api/browse',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({type:'folder',title:"Select your Manager's Tech Reports folder",initial_dir:startPath})});
    const data = await res.json();
    if(!data.path) return;
    reportsPath = data.path;
    document.getElementById('reportsFolder').value = data.path;
    const fRes = await fetch('/api/browse/files',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({path:data.path})});
    const fData = await fRes.json();
    const list = document.getElementById('fileList');
    list.innerHTML = '';
    if(!fData.files || fData.files.length===0){
      document.getElementById('reportsError').textContent = 'No .xlsm/.xlsx files found in this folder.';
      document.getElementById('btn3').disabled = true;
      return;
    }
    document.getElementById('reportsError').textContent = '';
    fData.files.forEach(name=>{
      const btn = document.createElement('button');
      btn.className = 'file-opt'; btn.textContent = name;
      btn.onclick = ()=>{
        list.querySelectorAll('.file-opt').forEach(b=>b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedFile = name;
        document.getElementById('btn3').disabled = false;
      };
      list.appendChild(btn);
    });
  };

  // Step 3 -> 4
  document.getElementById('btn3').onclick = async ()=>{
    if(!selectedFile) return;
    const fullPath = reportsPath.replace(/\//g,'\\') + '\\' + selectedFile;
    state.target_workbook = fullPath;
    show('step4');
    document.getElementById('sheetInfo').textContent = 'Loading sheets...';
    const res = await fetch('/api/workbook/sheets?path=' + encodeURIComponent(fullPath));
    const data = await res.json();
    const list = document.getElementById('sheetList');
    list.innerHTML = '';
    if(data.error){document.getElementById('sheetInfo').textContent = data.error; return;}
    if(data.sheets.length===1){
      selectedSheet = data.sheets[0];
      document.getElementById('sheetInfo').textContent = 'Auto-selected: ' + selectedSheet;
      const btn = document.createElement('button');
      btn.className = 'sheet-opt selected'; btn.textContent = selectedSheet;
      list.appendChild(btn);
    } else {
      document.getElementById('sheetInfo').textContent = 'Multiple sheets found \u2014 pick yours:';
      data.sheets.forEach(name=>{
        const btn = document.createElement('button');
        btn.className = 'sheet-opt'; btn.textContent = name;
        if(name.toLowerCase()===state.user_display_name.toLowerCase()||name.toLowerCase()===state.user_id.toLowerCase()){
          btn.classList.add('selected'); selectedSheet = name;
        }
        btn.onclick = ()=>{
          list.querySelectorAll('.sheet-opt').forEach(b=>b.classList.remove('selected'));
          btn.classList.add('selected'); selectedSheet = name;
        };
        list.appendChild(btn);
      });
    }
  };

  // Step 4 -> 5
  document.getElementById('btn4').onclick = ()=>{
    if(!selectedSheet){document.getElementById('sheetError').textContent='Select a sheet';return;}
    state.target_sheet = selectedSheet;
    show('step5');
  };

  // Finish
  document.getElementById('btn5').onclick = async ()=>{
    state.schedule = {
      default_start: document.getElementById('schedStart').value,
      default_end: document.getElementById('schedEnd').value,
      break_count: parseInt(document.getElementById('schedBreaks').value)||2,
      break_minutes: parseInt(document.getElementById('schedBreakMin').value)||15,
      lunch_minutes: parseInt(document.getElementById('schedLunch').value)||30
    };
    await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(state)});
    show('stepDone');
    setTimeout(()=>{ window.location.href = '/'; },1500);
  };

  // Back buttons
  document.getElementById('back3').onclick = ()=> show('step2');
  document.getElementById('back4').onclick = ()=> show('step3');
  document.getElementById('back5').onclick = ()=> show('step4');
})();
</script>
</body>
</html>"""


def main():
    logger.info("DayBuilder starting.")
    splash = show_splash()

    cfg = load_config()

    # Auto-populate user_id BEFORE anything else
    cfg.setdefault("user_id", os.getlogin())
    cfg.setdefault("port", 5150)
    cfg.setdefault("db_path", "timelog.db")
    save_config(cfg)

    # Try to resolve web_root (share or local dev)
    web_root = resolve_web_root(cfg)
    serve_from = None

    if web_root and check_share(web_root):
        # Share reachable — sync cache if stale
        if cache_is_stale(web_root):
            sync_cache(web_root)
            logger.info(f"Cache updated to version {get_version(web_root)}")
        serve_from = web_root
    elif web_root:
        # web_root exists but share_config missing (local dev)
        serve_from = web_root
    elif CACHE_DIR.exists() and os.path.isfile(str(CACHE_DIR / "shared_config.json")):
        # Offline fallback
        serve_from = str(CACHE_DIR)
        logger.warning("Share unreachable — serving from cache.")

    # serve_from may be None on first run — that's OK, embedded setup handles it

    # Init DB
    from db import init_db
    db_path = str(BASE_DIR / cfg["db_path"])
    init_db(db_path)

    # Pull 60-day history from remote user DB on startup (if share reachable)
    if serve_from and cfg.get("sync_target"):
        try:
            import sync
            ok, err = sync.startup_sync(cfg, db_path)
            if ok:
                logger.info("Startup sync complete")
            elif err:
                logger.warning(f"Startup sync: {err}")
        except Exception as e:
            logger.warning(f"Startup sync failed: {e}")

    # Start Flask
    from app import create_app
    share_ok = serve_from is not None and check_share(serve_from) if serve_from else False
    app = create_app(cfg, serve_from, db_path, share_ok)
    port = cfg["port"]

    # Open browser in app mode (dedicated window, no tabs/address bar)
    url = f"http://localhost:{port}"
    import subprocess, shutil, tempfile
    browser_proc = None
    browser_data_dir = os.path.join(tempfile.gettempdir(), "daybuilder_browser")
    os.makedirs(browser_data_dir, exist_ok=True)
    for browser in [
        shutil.which("msedge"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
        shutil.which("chrome"),
        shutil.which("chromium"),
        os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
    ]:
        if browser and os.path.isfile(browser):
            browser_proc = subprocess.Popen([
                browser, f"--app={url}",
                f"--user-data-dir={browser_data_dir}",
                "--window-size=1200,900", "--window-position=100,50",
                "--no-first-run", "--no-default-browser-check",
                "--disable-sync", "--disable-features=msEdgeAccountSignIn,SignIn",
                "--inprivate"
            ])
            break
    if not browser_proc:
        webbrowser.open(url)
    app.config["BROWSER_PROC"] = browser_proc
    if splash:
        splash.destroy()
    logger.info(f"Serving on port {port}, web_root={serve_from}")
    app.run(host="127.0.0.1", port=port, debug=False)


if __name__ == "__main__":
    main()
