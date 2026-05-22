"""DayBuilder Installer/Updater — checks version, backs up, extracts, launches."""
import os
import sys
import json
import shutil
import socket
import subprocess
import zipfile
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from pathlib import Path
from datetime import datetime

# --- Constants ---
SHARE_BASE = Path(r"W:\Team Spaces\RAD IT Engineering\NA RAD IT Engineering\RAD1\RMAJobLogger\DayBuilder")
ZIP_PATH = SHARE_BASE / "RMA Job Tracking App-v3.zip"
VERSION_URL = SHARE_BASE / "web" / "version.json"
EXE_NAME = "RMA Job Tracking Launcher.exe"
ZIP_EXE_NAME = "RMA Job Tracking Launcher_new.exe"
DATA_FILES = ["config.json", "timelog.db", "daybuilder.log"]
MAX_BACKUPS = 3
APP_PORT = 5150
DEFAULT_INSTALL = Path(r"D:\DayBuilder")


def get_remote_version():
    """Read version from the network share's web/version.json."""
    try:
        return json.loads(VERSION_URL.read_text())["version"]
    except (OSError, KeyError, json.JSONDecodeError):
        return None


def get_local_version(install_dir):
    """Read version from local cache/version.json."""
    vf = install_dir / "cache" / "version.json"
    try:
        return json.loads(vf.read_text())["version"]
    except (OSError, KeyError, json.JSONDecodeError):
        return None


def parse_version(v):
    """Convert version string to comparable tuple."""
    try:
        return tuple(int(x) for x in v.split("."))
    except (ValueError, AttributeError):
        return (0,)


def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def find_existing_install():
    """Check if exe exists in the directory where this installer lives."""
    here = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).parent
    if (here / EXE_NAME).exists():
        return here
    if DEFAULT_INSTALL.exists() and (DEFAULT_INSTALL / EXE_NAME).exists():
        return DEFAULT_INSTALL
    return None


def backup_install(install_dir, status_cb=None):
    """Back up old exe and data files into a timestamped backup folder."""
    ts = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    backup_dir = install_dir / "backup" / ts
    backup_dir.mkdir(parents=True, exist_ok=True)

    exe_path = install_dir / EXE_NAME
    if exe_path.exists():
        if status_cb:
            status_cb("Backing up old executable...")
        shutil.copy2(exe_path, backup_dir / EXE_NAME)

    for f in DATA_FILES:
        src = install_dir / f
        if src.exists():
            if status_cb:
                status_cb(f"Backing up {f}...")
            shutil.copy2(src, backup_dir / f)

    # Prune old backups
    backup_root = install_dir / "backup"
    backups = sorted(backup_root.iterdir(), reverse=True)
    for old in backups[MAX_BACKUPS:]:
        shutil.rmtree(old, ignore_errors=True)

    return backup_dir


def extract_exe(install_dir, status_cb=None):
    """Extract the exe from the network zip into install_dir."""
    if status_cb:
        status_cb("Extracting new version...")
    with zipfile.ZipFile(ZIP_PATH, "r") as zf:
        # Extract the exe (named differently in zip) and rename to expected name
        zf.extract(ZIP_EXE_NAME, install_dir)
    extracted = install_dir / ZIP_EXE_NAME
    target = install_dir / EXE_NAME
    if target.exists():
        target.unlink()
    extracted.rename(target)


def launch_app(install_dir):
    """Launch the app exe detached."""
    exe = install_dir / EXE_NAME
    subprocess.Popen([str(exe)], cwd=str(install_dir), creationflags=subprocess.DETACHED_PROCESS)


class InstallerApp:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("DayBuilder Installer")
        self.root.geometry("420x200")
        self.root.resizable(False, False)

        self.status_var = tk.StringVar(value="Checking for updates...")
        tk.Label(self.root, textvariable=self.status_var, wraplength=380, justify="left").pack(pady=(20, 10), padx=20)

        self.progress = ttk.Progressbar(self.root, mode="indeterminate", length=380)
        self.progress.pack(padx=20)
        self.progress.start(15)

        self.root.after(100, self.run)
        self.root.mainloop()

    def set_status(self, msg):
        self.status_var.set(msg)
        self.root.update_idletasks()

    def run(self):
        # Check network availability
        if not ZIP_PATH.exists():
            messagebox.showerror("Network Error", f"Cannot reach network share:\n{ZIP_PATH}\n\nCheck VPN/network connection.")
            self.root.destroy()
            return

        remote_ver = get_remote_version()
        if not remote_ver:
            messagebox.showerror("Error", "Could not read remote version info.")
            self.root.destroy()
            return

        install_dir = find_existing_install()

        if install_dir:
            # Existing install — check version
            local_ver = get_local_version(install_dir)
            if local_ver and parse_version(remote_ver) <= parse_version(local_ver):
                self.set_status(f"Already up to date (v{local_ver}).")
                self.progress.stop()
                if messagebox.askyesno("Up to Date", f"DayBuilder v{local_ver} is current.\nLaunch the app?"):
                    launch_app(install_dir)
                self.root.destroy()
                return

            # Update needed
            if is_port_in_use(APP_PORT):
                messagebox.showwarning("App Running", "DayBuilder is currently running.\nPlease close it before updating.")
                self.root.destroy()
                return

            self.set_status(f"Updating {local_ver or 'unknown'} → {remote_ver}...")
            backup_install(install_dir, self.set_status)
            extract_exe(install_dir, self.set_status)
        else:
            # Fresh install — ask for directory
            self.progress.stop()
            self.root.withdraw()
            install_dir = filedialog.askdirectory(title="Choose install location", initialdir=str(DEFAULT_INSTALL.parent))
            if not install_dir:
                self.root.destroy()
                return
            install_dir = Path(install_dir) / "DayBuilder"
            install_dir.mkdir(parents=True, exist_ok=True)
            self.root.deiconify()
            self.progress.start(15)
            self.set_status(f"Installing v{remote_ver} to {install_dir}...")
            extract_exe(install_dir, self.set_status)

        self.progress.stop()
        self.set_status(f"v{remote_ver} installed. Launching...")
        self.root.update_idletasks()
        launch_app(install_dir)
        self.root.after(1000, self.root.destroy)


if __name__ == "__main__":
    InstallerApp()
