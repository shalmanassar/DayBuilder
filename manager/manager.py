"""DayBuilder Manager — entry point: Flask on 5151, browser launch, embedded setup."""
import os
import sys
import json
import subprocess
import shutil
import tempfile
import webbrowser
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

if getattr(sys, "frozen", False):
    BASE_DIR = Path(sys.executable).parent.resolve()
else:
    BASE_DIR = Path(__file__).parent.resolve()

CONFIG_PATH = BASE_DIR / "manager_config.json"
LOG_PATH = BASE_DIR / "manager.log"

# --- Logging ---
logger = logging.getLogger("manager")
logger.setLevel(logging.DEBUG if "--debug" in sys.argv else logging.INFO)
handler = RotatingFileHandler(LOG_PATH, maxBytes=5 * 1024 * 1024, backupCount=3)
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
    try:
        import tkinter as tk
        splash = tk.Tk()
        splash.title("DayBuilder Manager")
        splash.configure(bg="#123d52")
        splash.geometry("340x100+500+300")
        splash.overrideredirect(True)
        splash.attributes("-topmost", True)
        tk.Label(splash, text="☀ DayBuilder Manager", font=("Segoe UI", 13, "bold"),
                 fg="#e8f4f8", bg="#123d52").pack(pady=(22, 4))
        tk.Label(splash, text="Opening browser...", font=("Segoe UI", 9),
                 fg="#8ab4c7", bg="#123d52").pack()
        splash.update()
        return splash
    except Exception:
        return None


def launch_browser(port):
    url = f"http://localhost:{port}"
    browser_data_dir = os.path.join(tempfile.gettempdir(), "daybuilder_manager_browser")
    os.makedirs(browser_data_dir, exist_ok=True)
    for browser in [
        shutil.which("msedge"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
        shutil.which("chrome"),
        os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
    ]:
        if browser and os.path.isfile(browser):
            return subprocess.Popen([
                browser, f"--app={url}",
                f"--user-data-dir={browser_data_dir}",
                "--window-size=1280,900", "--window-position=80,40",
                "--no-first-run", "--no-default-browser-check", "--disable-sync",
            ])
    webbrowser.open(url)
    return None


# --- Embedded Setup HTML ---
SETUP_HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>DayBuilder Manager — Setup</title>
<style>
:root{--bg-deep:#02090f;--bg-card:#1a2a35;--bg-surface:#1e3a4a;--text-primary:#e8f4f8;--text-muted:#8ab4c7;--accent:#3498db;--accent-hover:#2980b9;--success:#27ae60;--danger:#e74c3c;--border:#2c4a5a}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg-deep);color:var(--text-primary);min-height:100vh;display:flex;align-items:center;justify-content:center}
.setup-container{max-width:480px;width:100%;padding:2rem;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;position:relative}
h1{margin-bottom:0.5rem}
.sub{color:var(--text-muted);margin-bottom:1.5rem}
.step{display:none}.step.active{display:block}
label{display:block;color:var(--text-muted);font-size:0.85rem;margin-bottom:0.3rem}
input{width:100%;padding:0.6rem;margin-bottom:1rem;background:var(--bg-deep);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);font-size:1rem}
.row{display:flex;gap:0.5rem;align-items:center;margin-bottom:1rem}
.row input{flex:1;margin-bottom:0}
.browse{padding:0.6rem 1rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);cursor:pointer}
.browse:hover{background:var(--accent)}
.btn{width:100%;padding:0.75rem;margin-top:0.5rem;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer}
.btn:hover{background:var(--accent-hover)}
.back{background:none;border:none;color:var(--text-muted);cursor:pointer;margin-top:0.5rem}
.back:hover{color:var(--text-primary)}
.info{color:var(--text-muted);font-size:0.8rem;margin-bottom:0.5rem}
.err{color:var(--danger);font-size:0.85rem;margin-bottom:0.5rem}
.exit-btn{position:absolute;top:1rem;right:1rem;background:none;border:1px solid var(--border);color:var(--danger);padding:0.3rem 0.7rem;border-radius:4px;cursor:pointer}
</style>
</head>
<body>
<div class="setup-container">
<h1>&#9728; Manager Setup</h1>
<button class="exit-btn" onclick="fetch('/api/shutdown',{method:'POST'})">✕ Exit</button>
<p class="sub">Configure DayBuilder Manager.</p>

<div class="step active" id="step1">
  <label>Manager Name</label>
  <input id="mgrName" placeholder="Your name">
  <label>Manager ID (login)</label>
  <input id="mgrId" placeholder="e.g. jsmith">
  <button class="btn" id="btn1">Next &#8594;</button>
</div>

<div class="step" id="step2">
  <label>RMAJobLogger folder on the shared drive</label>
  <p class="info">This is the root folder containing DayBuilder data.</p>
  <div class="row">
    <input id="rmaPath" placeholder="Browse or paste path...">
    <button class="browse" id="browseRma">Browse</button>
  </div>
  <div class="err" id="rmaErr"></div>
  <button class="btn" id="btn2">Next &#8594;</button>
  <button class="back" onclick="show('step1')">&#8592; Back</button>
</div>

<div class="step" id="step3">
  <label>Confirm Setup</label>
  <p class="info" id="summary"></p>
  <button class="btn" id="btn3">Save &amp; Launch &#10003;</button>
  <button class="back" onclick="show('step2')">&#8592; Back</button>
</div>

<div class="step" id="stepDone">
  <h2 style="color:var(--success)">&#10003; Setup Complete</h2>
  <p class="info">Restarting...</p>
</div>
</div>

<script>
(function(){
  const $=id=>document.getElementById(id);
  function show(id){document.querySelectorAll('.step').forEach(s=>s.classList.remove('active'));$(id).classList.add('active')}
  window.show=show;

  // Pre-fill from OS login
  fetch('/api/config').then(r=>r.json()).then(c=>{
    if(c.manager_id) $('mgrId').value=c.manager_id;
    if(c.manager_name) $('mgrName').value=c.manager_name;
  }).catch(()=>{});

  $('btn1').onclick=()=>{
    if(!$('mgrName').value.trim()||!$('mgrId').value.trim()) return;
    show('step2');
  };

  $('browseRma').onclick=async()=>{
    const res=await fetch('/api/browse',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({type:'folder',title:'Select RMAJobLogger folder'})});
    const d=await res.json();
    if(d.path) $('rmaPath').value=d.path;
  };

  $('btn2').onclick=()=>{
    const p=$('rmaPath').value.trim();
    if(!p){$('rmaErr').textContent='Select a folder';return;}
    $('summary').textContent='Manager: '+$('mgrName').value+' ('+$('mgrId').value+') | Path: '+p;
    show('step3');
  };

  $('btn3').onclick=async()=>{
    await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        manager_name:$('mgrName').value.trim(),
        manager_id:$('mgrId').value.trim(),
        rma_job_logger_path:$('rmaPath').value.trim()
      })});
    show('stepDone');
    setTimeout(()=>location.reload(),1500);
  };
})();
</script>
</body>
</html>"""


def main():
    from flask import Response
    import signal

    logger.info("DayBuilder Manager starting.")
    splash = show_splash()

    cfg = load_config()
    cfg.setdefault("port", 5151)
    cfg.setdefault("manager_id", os.getlogin())
    save_config(cfg)

    port = cfg["port"]

    # If config incomplete, serve embedded setup
    if not cfg.get("rma_job_logger_path"):
        from flask import Flask
        app = Flask(__name__, static_folder=None)

        @app.route("/", defaults={"path": ""})
        @app.route("/<path:path>")
        def setup_page(path):
            if path.startswith("api/"):
                return None  # fall through to API routes
            return Response(SETUP_HTML, mimetype="text/html")

        @app.route("/api/config", methods=["GET"])
        def get_cfg():
            from flask import jsonify
            return jsonify(cfg)

        @app.route("/api/config", methods=["POST"])
        def save_cfg():
            from flask import request, jsonify
            updates = request.get_json(force=True)
            cfg.update(updates)
            save_config(cfg)
            return jsonify({"ok": True})

        @app.route("/api/browse", methods=["POST"])
        def browse_setup():
            from flask import request, jsonify
            import threading
            body = request.get_json(force=True)
            result = {"path": None}

            def _dialog():
                try:
                    import tkinter as tk
                    from tkinter import filedialog
                    root = tk.Tk(); root.withdraw(); root.attributes("-topmost", True)
                    result["path"] = filedialog.askdirectory(title=body.get("title", "Select")) or None
                    root.destroy()
                except Exception:
                    pass

            t = threading.Thread(target=_dialog); t.start(); t.join(timeout=60)
            return jsonify(result)

        @app.route("/api/shutdown", methods=["POST"])
        def shutdown_setup():
            os.kill(os.getpid(), signal.SIGTERM)
            from flask import jsonify
            return jsonify({"ok": True})

        browser_proc = launch_browser(port)
        if splash:
            splash.destroy()
        logger.info(f"Setup mode on port {port}")
        app.run(host="127.0.0.1", port=port, debug=False)
    else:
        # Normal launch — full app
        from manager_app import create_app, _import_status
        app = create_app(cfg)

        # Auto-import on launch (background thread)
        def _auto_import():
            import importer
            try:
                logger.info("Auto-import starting...")
                _import_status["running"] = True
                result = importer.import_all(cfg)
                _import_status["last_result"] = result
                logger.info(f"Auto-import done: {result['total_imported']} days imported, "
                            f"{result['total_skipped']} skipped, {len(result['discrepancies'])} discrepancies")
            except Exception as e:
                logger.warning(f"Auto-import failed: {e}")
            finally:
                _import_status["running"] = False

        import threading
        threading.Thread(target=_auto_import, daemon=True).start()

        browser_proc = launch_browser(port)
        if splash:
            splash.destroy()
        logger.info(f"Manager running on port {port}")
        app.run(host="127.0.0.1", port=port, debug=False)


if __name__ == "__main__":
    main()
