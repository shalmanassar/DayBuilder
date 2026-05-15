"""deploy.py — Copy local web/ folder to the network share for all users."""
import json
import shutil
from pathlib import Path
from datetime import datetime, timezone

BASE = Path(__file__).parent.resolve()
LOCAL_WEB = BASE / "web"
VERSION_FILE = LOCAL_WEB / "version.json"
SHARE_TARGET = Path(r"W:\Team Spaces\RAD IT Engineering\NA RAD IT Engineering\RAD1\RMAJobLogger\DayBuilder\web")


def bump_version():
    """Increment patch version and update timestamp."""
    ver = json.loads(VERSION_FILE.read_text())
    parts = ver["version"].split(".")
    parts[2] = str(int(parts[2]) + 1)
    ver["version"] = ".".join(parts)
    ver["updated"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    VERSION_FILE.write_text(json.dumps(ver, indent=2))
    return ver["version"]


def deploy():
    if not LOCAL_WEB.is_dir():
        print("ERROR: local web/ folder not found.")
        return

    if not SHARE_TARGET.parent.exists():
        print(f"ERROR: share path not reachable: {SHARE_TARGET.parent}")
        return

    version = bump_version()
    print(f"Deploying v{version} to {SHARE_TARGET}")

    if SHARE_TARGET.exists():
        shutil.rmtree(SHARE_TARGET)
    shutil.copytree(LOCAL_WEB, SHARE_TARGET)

    print(f"Done. {sum(1 for _ in SHARE_TARGET.rglob('*') if _.is_file())} files deployed.")


if __name__ == "__main__":
    deploy()
