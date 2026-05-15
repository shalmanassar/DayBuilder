"""DayBuilder bootstrap — Flask server, browser launch, offline detection, Tier 1 setup."""
import os
import sys
import json
import shutil
import webbrowser
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

BASE_DIR = Path(sys.executable).parent.resolve() if getattr(sys, 'frozen', False) else Path(__file__).parent.resolve()
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


def tier1_setup():
    """Native dialog to select RMAJobLogger directory and pre-fill username."""
    try:
        import tkinter as tk
        from tkinter import filedialog, messagebox, simpledialog
        root = tk.Tk()
        root.withdraw()

        # Pre-fill username
        default_user = os.getlogin()
        user_id = simpledialog.askstring("DayBuilder Setup", "Your username (login):", initialvalue=default_user, parent=root)
        if not user_id:
            user_id = default_user

        # Ask for RMAJobLogger directory
        messagebox.showinfo("DayBuilder Setup", "Select the RMAJobLogger folder on the shared drive.")
        # Try default start path
        start_path = r"W:\Team Spaces\RAD IT Engineering\NA RAD IT Engineering"
        if not os.path.isdir(start_path):
            start_path = os.path.expanduser("~")
        folder = filedialog.askdirectory(title="Select the RMAJobLogger folder", initialdir=start_path)
        root.destroy()

        if not folder:
            return None, user_id

        # Auto-discover web_root and sync_target
        web_root = os.path.join(folder, "DayBuilder", "web")
        sync_target = os.path.join(folder, "POST")

        # Validate
        if not os.path.isdir(web_root):
            logger.warning(f"DayBuilder/web not found under {folder}, falling back to local web/")
            web_root = None
        if not os.path.isdir(sync_target):
            logger.warning(f"POST/ not found under {folder}")
            sync_target = None

        return {"web_root": web_root, "sync_target": sync_target, "user_id": user_id}, user_id
    except Exception as e:
        logger.error(f"Tier 1 setup failed: {e}")
    return None, None


def resolve_web_root(cfg):
    """Determine web_root: config value, or fallback to local web/ for dev."""
    web_root = cfg.get("web_root")
    if web_root and os.path.isdir(web_root):
        return web_root
    # Dev fallback: local web/ subfolder
    local_web = BASE_DIR / "web"
    if local_web.is_dir():
        return str(local_web)
    return None


def check_share(web_root):
    """Return True if web_root is reachable and has index.html or shared_config.json."""
    if not web_root:
        return False
    return os.path.isfile(os.path.join(web_root, "shared_config.json"))


def sync_cache(web_root):
    """Copy web assets to local cache for offline fallback."""
    try:
        if CACHE_DIR.exists():
            shutil.rmtree(CACHE_DIR)
        shutil.copytree(web_root, CACHE_DIR)
        logger.info("Cache synced from share.")
    except Exception as e:
        logger.warning(f"Cache sync failed: {e}")


def get_version(web_root):
    """Read version from version.json in web_root."""
    ver_path = os.path.join(web_root, "version.json")
    if os.path.isfile(ver_path):
        with open(ver_path) as f:
            return json.load(f).get("version", "0.0.0")
    return "0.0.0"


def cache_is_stale(web_root):
    """Compare share version.json to cached version.json. Returns True if cache needs refresh."""
    share_ver = get_version(web_root)
    cache_ver = get_version(str(CACHE_DIR))
    return share_ver != cache_ver


def main():
    logger.info("DayBuilder starting.")
    cfg = load_config()

    # Tier 1: ensure web_root is set
    web_root = resolve_web_root(cfg)
    if not web_root:
        result, user_id = tier1_setup()
        if result and result.get("web_root"):
            cfg["web_root"] = result["web_root"]
            if result.get("sync_target"):
                cfg["sync_target"] = result["sync_target"]
            if user_id:
                cfg.setdefault("user_id", user_id)
            save_config(cfg)
            web_root = resolve_web_root(cfg)
        if not web_root:
            # Fall back to local web/ for dev
            local_web = BASE_DIR / "web"
            if local_web.is_dir():
                web_root = str(local_web)
                cfg["web_root"] = web_root
                if user_id:
                    cfg.setdefault("user_id", user_id)
                save_config(cfg)
            else:
                logger.error("No web_root available. Exiting.")
                sys.exit(1)

    # Offline detection
    share_ok = check_share(web_root)
    serve_from = web_root if share_ok else str(CACHE_DIR)
    if not share_ok:
        if CACHE_DIR.exists():
            logger.warning("Share unreachable — serving from cache.")
        else:
            logger.error("Share unreachable and no cache. Exiting.")
            sys.exit(1)
    else:
        # Cache busting: only sync if version changed
        if cache_is_stale(web_root):
            sync_cache(web_root)
            logger.info(f"Cache updated to version {get_version(web_root)}")
        else:
            logger.info("Cache is current, skipping sync.")

    # Get version for URL param
    version = get_version(serve_from)

    # Ensure defaults in config
    cfg.setdefault("port", 5150)
    cfg.setdefault("db_path", "timelog.db")
    save_config(cfg)

    # Init DB
    from db import init_db
    db_path = str(BASE_DIR / cfg["db_path"])
    init_db(db_path)

    # Start Flask
    from app import create_app
    app = create_app(cfg, serve_from, db_path, share_ok)
    port = cfg["port"]

    # Open browser with cache-busting version param
    webbrowser.open(f"http://localhost:{port}?v={version}")
    logger.info(f"Serving on port {port}, web_root={serve_from}, version={version}")
    app.run(host="127.0.0.1", port=port, debug=False)


if __name__ == "__main__":
    main()
