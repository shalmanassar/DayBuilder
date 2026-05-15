# SyncExcelCode.py
# A Python script to manage and synchronize VBA class modules in an Excel workbook.
# Features include status checking, backup creation, closing the workbook,
# refreshing class modules, opening the workbook, and recovering from backups.

# --- IMPORTANT ---
# If you get a "Programmatic access to Visual Basic Project is not trusted" error,
# you must enable a specific setting in Excel's Trust Center.
# See the comment in the `get_vba_component_lists` function for instructions.
# -----------------

#excel object classes export as .cls files in the same directory as this script and must be rewitten as .bas files to work with CodeModule property
#excel .bas files are global public macros and functions

import os
import sys
import shutil
import glob
import json
import tkinter as tk
from tkinter import messagebox, filedialog
import win32com.client
from datetime import datetime
import tkinter.simpledialog
import zipfile
import subprocess
try:
    import winreg
except ImportError:
    winreg = None
def open_excel_workbook_with_timeout(path: str, timeout_sec: int = 20, retry_attempts: int = 2):
    """
    Open the Excel workbook with bounded wait. Retries a few times to handle cloud/network delays.
    Returns (excel_app, workbook). Raises Exception on failure/timeout.
    """
    import time
    start = time.time()
    excel = win32com.client.Dispatch("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    last_err = None
    attempt = 0
    while attempt <= retry_attempts:
        try:
            wb = excel.Workbooks.Open(path)
            if wb is None:
                raise Exception("Open returned None")
            # Validate workbook is actually accessible
            try:
                _ = wb.Name
                # Try VBProject access but don't fail if trust isn't enabled
                try:
                    _ = wb.VBProject.VBComponents.Count
                except Exception as vb_err:
                    # Check if it's a trust issue vs workbook not opening
                    if "programmatic access" in str(vb_err).lower():
                        # Trust issue - workbook is open but VBProject blocked
                        pass
                    else:
                        # Some other VBProject issue - workbook might not be fully open
                        raise Exception(f"Workbook opened but VBProject error: {vb_err}")
            except Exception as name_err:
                raise Exception(f"Workbook.Name not accessible: {name_err}")
            return excel, wb
        except Exception as e:
            last_err = e
            attempt += 1
            if time.time() - start >= timeout_sec:
                break
            time.sleep(2)
    # Timeout: clean up excel instance
    try:
        excel.Quit()
    except Exception:
        pass
    prov = detect_cloud_provider(path)
    hint = ""
    if prov:
        hint = f"\nDetected {prov}. Ensure sync is complete."
    raise Exception(
        "Timed out opening workbook. Please verify network connectivity, file permissions, and try opening the file in Excel manually." + hint +
        (f"\nLast error: {last_err}" if last_err else "")
    )

# Get the directory where the script/exe is located
if getattr(sys, 'frozen', False):
    # Running as compiled exe
    script_dir = os.path.dirname(sys.executable)
else:
    # Running as Python script
    script_dir = os.path.dirname(os.path.abspath(__file__))

# --- Settings / Persistence ---
settings_path = os.path.join(script_dir, "settings.json")

def load_settings():
    try:
        with open(settings_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def save_settings(data):
    try:
        with open(settings_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass

# --- Workbook Selection ---
def select_workbook():
    files = [f for f in os.listdir(script_dir) if f.lower().endswith(('.xlsm', '.xlsb'))]
    if not files:
        messagebox.showerror("No Workbook", "No .xlsm or .xlsb file found in this directory.")
        exit()
    elif len(files) == 1:
        return files[0]
    else:
        # Prompt user to select
        choice = tkinter.simpledialog.askstring(
            "Select Workbook",
            "Multiple workbooks found:\n" + "\n".join(f"{i+1}: {name}" for i, name in enumerate(files)) + "\n\nEnter number:"
        )
        try:
            idx = int(choice) - 1
            if idx < 0 or idx >= len(files):
                raise ValueError
            return files[idx]
        except Exception:
            messagebox.showerror("Selection Error", "Invalid selection.")
            exit()

# Initialize variables - will be set/updated after GUI creation
xlsm_name = None
xlsm_path = None

# project_dir holds where .bas/.cls and backups live (can be target dir or a separate working dir)
project_dir = None

def get_backup_dir():
    base = project_dir if project_dir else script_dir
    return os.path.join(base, "backup")

# --- Backup Project ---
def backup_project():
    try:
        bdir = get_backup_dir()
        if not os.path.exists(bdir):
            os.makedirs(bdir)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        zip_name = f"{os.path.splitext(xlsm_name)[0]}_project_{timestamp}.zip"
        zip_path = os.path.join(bdir, zip_name)
        
        file_count = 0
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            scan_dir = project_dir if project_dir else script_dir
            for f in os.listdir(scan_dir):
                # Skip backup folder, exe files, hidden files, and system files
                if (f == 'backup' or f.endswith('.exe') or f.startswith('.') or
                    f.startswith('~') or f.endswith('.tmp')):
                    continue
                file_path = os.path.join(scan_dir, f)
                if os.path.isfile(file_path):
                    try:
                        zipf.write(file_path, arcname=f)
                        file_count += 1
                    except (PermissionError, OSError):
                        # Skip files that can't be accessed
                        continue
        
        messagebox.showinfo("Project Backup", f"Project backup created:\n{zip_name}\n\nFiles backed up: {file_count}\nLocation: {bdir}", parent=root)
    except Exception as e:
        messagebox.showerror("Backup Error", f"Failed to create project backup:\n{e}", parent=root)

# --- Project Notes ---
def open_notes():
    base_dir = project_dir if project_dir else script_dir
    notes_path = os.path.join(base_dir, "notes.txt")
    if not os.path.exists(notes_path):
        with open(notes_path, "w") as f:
            f.write("")
    notes_win = tk.Toplevel(root)
    notes_win.title("Project Notes")
    notes_win.geometry("400x300")
    text = tk.Text(notes_win, wrap="word")
    text.pack(expand=True, fill="both")
    with open(notes_path, "r") as f:
        text.insert("1.0", f.read())

    def save_notes(event=None):
        with open(notes_path, "w") as f:
            f.write(text.get("1.0", "end-1c"))
        # Reset modified flag
        text.edit_modified(False)

    # Save when text is modified
    def on_modified(event=None):
        save_notes()

    # Save when focus leaves the notes window
    notes_win.bind("<FocusOut>", save_notes)
    text.bind("<<Modified>>", on_modified)

    tk.Button(notes_win, text="Save Notes", command=save_notes).pack(pady=5)

def get_last_save():
    if os.path.exists(xlsm_path):
        return datetime.fromtimestamp(os.path.getmtime(xlsm_path)).strftime("%Y-%m-%d %H:%M:%S")
    return "File not found"

def get_last_backup():
    bdir = get_backup_dir()
    if not os.path.exists(bdir):
        return "No backup"
    
    # Get workbook backups (.xlsm)
    wb_backups = glob.glob(os.path.join(bdir, f"{xlsm_name}_*.xlsm"))
    # Get project backups (.zip)
    proj_backups = glob.glob(os.path.join(bdir, f"{os.path.splitext(xlsm_name)[0]}_project_*.zip"))
    
    result = []
    if wb_backups:
        latest_wb = max(wb_backups, key=os.path.getmtime)
        wb_date = datetime.fromtimestamp(os.path.getmtime(latest_wb)).strftime("%Y-%m-%d %H:%M:%S")
        result.append(f"Workbook..... {wb_date}")

    if proj_backups:
        latest_proj = max(proj_backups, key=os.path.getmtime)
        proj_date = datetime.fromtimestamp(os.path.getmtime(latest_proj)).strftime("%Y-%m-%d %H:%M:%S")
        result.append(f"Project...... {proj_date}")
    
    return "\n".join(result) if result else "No backup"

def is_excel_file_open():
    if not xlsm_name:
        return False
    try:
        excel = win32com.client.GetActiveObject("Excel.Application")
        for w in excel.Workbooks:
            if os.path.basename(w.FullName).lower() == xlsm_name.lower():
                return True
    except Exception:
        pass
    return False

def ensure_target_selected():
    if not xlsm_path or not xlsm_name:
        messagebox.showinfo("No Target", "Please select a target workbook first (Change Target).", parent=root)
        return False
    return True

def get_status():
    if not ensure_target_selected():
        return
    status = "Excel file is "
    status += "OPEN" if is_excel_file_open() else "CLOSED"
    last_save = get_last_save()
    last_backup = get_last_backup()
    
    # Format with dots for alignment
    status += f"\nLast Save..... {last_save}"
    if "\n" in last_backup:
        status += f"\nLast Backup:\n{last_backup}"
    else:
        status += f"\nLast Backup... {last_backup}"
    
    messagebox.showinfo("Status", status, parent=root)

def backup():
    if not ensure_target_selected():
        return
    bdir = get_backup_dir()
    if not os.path.exists(bdir):
        os.makedirs(bdir)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = os.path.join(bdir, f"{xlsm_name}_{timestamp}.xlsm")
    shutil.copy2(xlsm_path, backup_file)
    messagebox.showinfo("Backup", f"Backup created:\n{backup_file}", parent=root)

def close_excel():
    if not ensure_target_selected():
        return
    try:
        excel = win32com.client.GetActiveObject("Excel.Application")
        workbook_found = False
        for w in excel.Workbooks:
            if os.path.basename(w.FullName).lower() == xlsm_name.lower():
                w.Save()
                w.Close(SaveChanges=False)  # Force close without prompting
                workbook_found = True
                break
        
        if workbook_found:
            messagebox.showinfo("Close Excel", f"Workbook '{xlsm_name}' closed.", parent=root)
        else:
            messagebox.showinfo("Close Excel", f"Workbook '{xlsm_name}' not currently open.", parent=root)
    except Exception as e:
        messagebox.showinfo("Close Excel", "Excel is not running or cannot access workbooks.", parent=root)

def refresh_classes():
    if not ensure_target_selected():
        return
    if is_excel_file_open():
        messagebox.showwarning("Sync", "Please close the workbook before syncing classes.", parent=root)
        return
    backup()
    def try_open_now_action():
        try:
            set_status("Trying to open workbook now...")
            excel, wb = open_excel_workbook_with_timeout(xlsm_path, timeout_sec=25, retry_attempts=0)
            set_status("Workbook opened successfully.")
            vbproj = wb.VBProject
            search_dir = project_dir if project_dir else script_dir
            cls_files = glob.glob(os.path.join(search_dir, "*.cls"))
            cls_names = [os.path.splitext(os.path.basename(f))[0] for f in cls_files]
            to_remove = []
            for comp in vbproj.VBComponents:
                if comp.Type == 2 and comp.Name in cls_names:
                    to_remove.append(comp.Name)
            for name in to_remove:
                vbproj.VBComponents.Remove(vbproj.VBComponents.Item(name))
            for cls_file in cls_files:
                vbproj.VBComponents.Import(cls_file)
            wb.Save()
            wb.Close(False)
            excel.Quit()
            messagebox.showinfo("Sync", "Classes synchronized.", parent=root)
        except Exception as e:
            set_status(f"Try Open Now failed: {e}")
    def show_try_open_now(msg):
        set_status(msg)
        for widget in right_frame.winfo_children():
            if getattr(widget, "_is_try_open_now", False):
                widget.destroy()
        btn = tk.Button(right_frame, text="Try Open Now", command=try_open_now_action, width=14, fg="blue")
        btn._is_try_open_now = True
        btn.pack(anchor="w", pady=(6,2))
    try:
        excel, wb = open_excel_workbook_with_timeout(xlsm_path, timeout_sec=25, retry_attempts=3)
    except Exception as e:
        messagebox.showerror("Open Failed", str(e), parent=root)
        return

def open_excel():
    if not ensure_target_selected():
        return
    os.startfile(xlsm_path)

def recover():
    if not ensure_target_selected():
        return
    # Ensure workbook is closed
    if is_excel_file_open():
        close_excel()
    
    # Save current version with "xxx" prefix
    bdir = get_backup_dir()
    if not os.path.exists(bdir):
        os.makedirs(bdir)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = os.path.join(bdir, f"xxx_{xlsm_name}_{timestamp}.xlsm")
    shutil.copy2(xlsm_path, backup_file)
    messagebox.showinfo("Recover", f"Current version backed up as:\n{backup_file}")

    # List last five backups (excluding "xxx" prefixed)
    backups = sorted(
        [f for f in glob.glob(os.path.join(bdir, f"{xlsm_name}_*.xlsm")) if not os.path.basename(f).startswith("xxx_")],
        key=os.path.getmtime,
        reverse=True
    )[:5]

    if not backups:
        messagebox.showinfo("Recover", "No backups available for recovery.")
        return

    # Let user choose backup
    backup_choices = [os.path.basename(f) for f in backups]
    choice = tkinter.simpledialog.askstring(
        "Recover", 
        "Choose backup to restore:\n" + "\n".join(f"{i+1}: {name}" for i, name in enumerate(backup_choices)) + "\n\nEnter number (1-5):"
    )
    try:
        idx = int(choice) - 1
        if idx < 0 or idx >= len(backups):
            raise ValueError
    except Exception:
        messagebox.showerror("Recover", "Invalid selection.")
        return

    # Restore selected backup
    shutil.copy2(backups[idx], xlsm_path)
    messagebox.showinfo("Recover", f"Recovered:\n{backup_choices[idx]}\nas {xlsm_name}")

def sync_excel_from_code():
    """
    Unified sync function that synchronizes all VBA components from external files:
    - Standard modules (.bas files) - removes and re-imports
    - Excel objects (sheets, ThisWorkbook .cls files) - uses CodeModule injection
    - Class modules (other .cls files) - removes and re-imports
    """
    if not ensure_target_selected():
        return
    if is_excel_file_open():
        messagebox.showwarning("Sync", "Please close the workbook before syncing.", parent=root)
        return
    backup()
    excel = win32com.client.Dispatch("Excel.Application")
    excel.Visible = False
    wb = excel.Workbooks.Open(xlsm_path)
    vbproj = wb.VBProject

    # Get all .bas and .cls files
    bas_files = glob.glob(os.path.join(script_dir, "*.bas"))
    cls_files = glob.glob(os.path.join(script_dir, "*.cls"))

    # Build a map of component names to their types in the workbook
    comp_types = {comp.Name: comp.Type for comp in vbproj.VBComponents}

    # Sync standard modules (.bas files)
    for bas_file in bas_files:
        module_name = os.path.splitext(os.path.basename(bas_file))[0]
        # Remove existing standard module with the same name
        for comp in vbproj.VBComponents:
            if comp.Type == 1 and comp.Name == module_name:  # 1 = vbext_ct_StdModule
                vbproj.VBComponents.Remove(comp)
                break
        # Import the new version
        vbproj.VBComponents.Import(bas_file)

    # Sync .cls files (both Excel objects and class modules)
    for cls_file in cls_files:
        code_name = os.path.splitext(os.path.basename(cls_file))[0]
        comp_type = comp_types.get(code_name)
        
        if comp_type == 100:  # Document object (sheet or ThisWorkbook)
            # Use CodeModule injection for Excel objects
            for comp in vbproj.VBComponents:
                if comp.Type == 100 and comp.Name == code_name:
                    with open(cls_file, "r") as f:
                        lines = f.readlines()
                    # Remove header lines
                    code = "".join(
                        line for line in lines
                        if not line.strip().startswith(
                            ("VERSION", "Attribute", "BEGIN", "END", "MultiUse")
                        )
                    )
                    cm = comp.CodeModule
                    cm.DeleteLines(1, cm.CountOfLines)
                    cm.AddFromString(code)
                    break
        elif comp_type == 2:  # Class module
            # Remove and re-import for class modules
            for comp in vbproj.VBComponents:
                if comp.Type == 2 and comp.Name == code_name:
                    vbproj.VBComponents.Remove(comp)
                    break
            vbproj.VBComponents.Import(cls_file)

    wb.Save()
    wb.Close(False)
    excel.Quit()
    messagebox.showinfo("Sync", "All VBA components synchronized from code files.", parent=root)

def sync_excel_objects():
    """
    Synchronize code for Excel objects (worksheets and ThisWorkbook) from .cls files.
    The .cls file name must match the code name of the sheet or 'ThisWorkbook'.
    Removes header lines (e.g., Attribute, VERSION, BEGIN, END, MultiUse) before injecting code.
    Uses CodeModule to update code.
    """
    if is_excel_file_open():
        messagebox.showwarning("Sync", "Please close the workbook before syncing Excel objects.")
        return
    try:
        excel, wb = open_excel_workbook_with_timeout(xlsm_path, timeout_sec=25, retry_attempts=3)
        # Successfully opened - now sync Excel objects
        vbproj = wb.VBProject
        search_dir = project_dir if project_dir else script_dir
        cls_files = glob.glob(os.path.join(search_dir, "*.cls"))
        for cls_file in cls_files:
            code_name = os.path.splitext(os.path.basename(cls_file))[0]
            for comp in vbproj.VBComponents:
                if comp.Type == 100 and comp.Name == code_name:
                    with open(cls_file, "r") as f:
                        lines = f.readlines()
                    code = "".join(
                        line for line in lines
                        if not line.strip().startswith(("VERSION", "Attribute", "BEGIN", "END", "MultiUse"))
                    )
                    cm = comp.CodeModule
                    cm.DeleteLines(1, cm.CountOfLines)
                    cm.AddFromString(code)
                    break
        wb.Save()
        wb.Close(False)
        excel.Quit()
        messagebox.showinfo("Sync", "Excel object code synchronized.", parent=root)
    except Exception as e:
        messagebox.showerror("Open Failed", str(e), parent=root)
        return

def sync_standard_modules():
    """
    Synchronize standard modules (.bas files) in the workbook.
    Only replaces modules that have a corresponding .bas file in the directory.
    """
    if is_excel_file_open():
        messagebox.showwarning("Sync", "Please close the workbook before syncing standard modules.")
        return
    try:
        excel, wb = open_excel_workbook_with_timeout(xlsm_path, timeout_sec=25, retry_attempts=3)
        # Successfully opened - now sync modules
        vbproj = wb.VBProject
        search_dir = project_dir if project_dir else script_dir
        bas_files = glob.glob(os.path.join(search_dir, "*.bas"))
        doc_names = [comp.Name for comp in vbproj.VBComponents if comp.Type == 100]
        for bas_file in bas_files:
            module_name = os.path.splitext(os.path.basename(bas_file))[0]
            if module_name in doc_names or module_name == "ThisWorkbook":
                continue
            for comp in vbproj.VBComponents:
                if comp.Type == 1 and comp.Name == module_name:
                    vbproj.VBComponents.Remove(comp)
                    break
            vbproj.VBComponents.Import(bas_file)
        wb.Save()
        wb.Close(False)
        excel.Quit()
        messagebox.showinfo("Sync", "Standard modules synchronized.", parent=root)
    except Exception as e:
        messagebox.showerror("Open Failed", str(e), parent=root)
        return

def export_vba_components():
    if not ensure_target_selected():
        return
    warn = messagebox.askyesno(
        "Export VBA Components",
        "This will export all classes, modules, and sheet objects from the workbook.\n"
        "Any existing files with the same name in this directory will be overwritten.\n\n"
        "Continue?"
    )
    if not warn:
        return

    try:
        excel, wb = open_excel_workbook_with_timeout(xlsm_path, timeout_sec=25, retry_attempts=3)
        # Successfully opened - now export components
        vbproj = wb.VBProject
        for comp in vbproj.VBComponents:
            name = comp.Name
            if comp.Type == 1:
                out_file = os.path.join(project_dir if project_dir else script_dir, f"{name}.bas")
            elif comp.Type == 2:
                out_file = os.path.join(project_dir if project_dir else script_dir, f"{name}.cls")
            elif comp.Type == 100:
                out_file = os.path.join(project_dir if project_dir else script_dir, f"{name}.cls")
            else:
                continue
            comp.Export(out_file)
        wb.Close(False)
        excel.Quit()
        messagebox.showinfo("Export", "Export complete. All files have been updated in the directory.")
    except Exception as e:
        messagebox.showerror("Open Failed", str(e), parent=root)
        return

def get_vba_component_lists():
    # --- TROUBLESHOOTING: "Programmatic access to Visual Basic Project is not trusted" ---
    # This error occurs if Excel's security settings block scripts from accessing the VBA project.
    # To fix this, you must enable access in Excel's Trust Center:
    #
    # 1. Open Excel.
    # 2. Go to File > Options.
    # 3. Select 'Trust Center' from the left menu, then click 'Trust Center Settings...'.
    # 4. In the new window, select 'Macro Settings' on the left.
    # 5. Check the box for "Trust access to the VBA project object model".
    # 6. Click OK on all dialog windows.
    #
    # NOTE: Enabling this setting reduces security. Only do this if you trust the scripts you run.
    # ------------------------------------------------------------------------------------
    try:
        excel, wb = open_excel_workbook_with_timeout(xlsm_path, timeout_sec=20, retry_attempts=2)
        # Successfully opened - now get components
        vbproj = wb.VBProject
        sheets, modules, classes = [], [], []
        for comp in vbproj.VBComponents:
            name = comp.Name
            if comp.Type == 100:
                exists = os.path.exists(os.path.join(project_dir if project_dir else script_dir, f"{name}.cls"))
                sheets.append((name, exists))
            elif comp.Type == 1:
                exists = os.path.exists(os.path.join(project_dir if project_dir else script_dir, f"{name}.bas"))
                modules.append((name, exists))
            elif comp.Type == 2:
                exists = os.path.exists(os.path.join(project_dir if project_dir else script_dir, f"{name}.cls"))
                classes.append((name, exists))
        wb.Close(False)
        excel.Quit()
        return sheets, modules, classes
    except Exception as e:
        set_status(f"Open Failed: {e}")
        # Don't call update_component_list here - it would cause infinite recursion!
        return [], [], []

# --- Directory Opening Functions ---
def open_vscode():
    try:
        subprocess.Popen(["code", project_dir if project_dir else script_dir])
    except FileNotFoundError:
        try:
            subprocess.Popen([r"C:\Users\%USERNAME%\AppData\Local\Programs\Microsoft VS Code\Code.exe", project_dir if project_dir else script_dir], shell=True)
        except Exception:
            messagebox.showerror("Error", "Could not open VSCode. Make sure it's installed.")
    except Exception:
        messagebox.showerror("Error", "Could not open VSCode.")

def open_powershell():
    try:
        base = project_dir if project_dir else script_dir
        subprocess.Popen(["cmd", "/c", "start", "powershell", "-NoExit", "-Command", f"Set-Location '{base}'"])
    except Exception:
        messagebox.showerror("Error", "Could not open PowerShell.")

def open_file_explorer():
    try:
        subprocess.Popen(["explorer", project_dir if project_dir else script_dir])
    except Exception:
        messagebox.showerror("Error", "Could not open File Explorer.")

# --- Trust Center Detection ---
def is_vbom_trust_enabled():
    if winreg is None:
        return None
    # Check common Office versions
    versions = ["16.0", "15.0", "14.0"]
    for ver in versions:
        try:
            key_path = fr"Software\Microsoft\Office\{ver}\Excel\Security"
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path) as k:
                val, _ = winreg.QueryValueEx(k, "AccessVBOM")
                if int(val) == 1:
                    return True
        except FileNotFoundError:
            continue
        except Exception:
            continue
    return False

def maybe_warn_trust_once():
    settings = load_settings()
    if settings.get("trust_warn_shown"):
        return
    status = is_vbom_trust_enabled()
    if status is False:
        messagebox.showwarning(
            "Excel Trust Center",
            "Programmatic access to the VBA project is currently disabled.\n\n"
            "To enable: Excel > File > Options > Trust Center > Trust Center Settings > Macro Settings >\n"
            "Check 'Trust access to the VBA project object model'.",
            parent=root,
        )
        settings["trust_warn_shown"] = True
        save_settings(settings)

def detect_cloud_provider(path_value: str):
    if not path_value:
        return None
    p = path_value.lower()
    mappings = {
        "onedrive": "OneDrive",
        "google drive": "Google Drive",
        "dropbox": "Dropbox",
        "workdocs": "Amazon WorkDocs",
        "box": "Box",
        "icloud": "iCloud Drive",
        "sharepoint": "SharePoint",
    }
    for key, name in mappings.items():
        if key in p:
            return name
    return None

# --- About and Help Functions ---
def show_about():
    about_text = """Excel VBA Project Sync Utility

A comprehensive tool for managing Excel VBA projects with external code files.

Key Features:
• Synchronize VBA code between Excel workbooks and external .cls/.bas files
• Backup and restore workbook versions
• Export VBA components to external files
• Project management with notes and backups
• Quick access to development tools (VSCode, PowerShell, File Explorer)

This utility enables version control and external editing of VBA code by maintaining separate .cls (class modules) and .bas (standard modules) files alongside your Excel workbook.

Developed by shalmanassar - 2025"""
    messagebox.showinfo("About", about_text)

def show_help():
    help_win = tk.Toplevel(root)
    help_win.title("Help - Button Functions")
    help_win.geometry("600x700")
    text = tk.Text(help_win, wrap="word", padx=10, pady=10)
    text.pack(expand=True, fill="both")
    
    help_text = """EXCEL VBA PROJECT SYNC UTILITY - HELP

TOP MENU BUTTONS (LEFT, FIRST ROW):
• Always On Top: Toggles whether the application window stays above other windows. Useful for keeping the utility visible while working in Excel or other programs.
• Change Target: Selects a different Excel workbook as the target for syncing and management. You can choose to work in-place or copy the workbook to a new working directory.
• Copy to Dir: Copies this application and optionally code files/backups to another directory, allowing you to set up a new project location quickly.

FILE STATUS FUNCTIONS:
• Get Status: Shows if the workbook is currently open in Excel, displays last save time and last backup time.
• Open Excel: Opens the target workbook in Excel for editing or testing.
• Close Excel: Closes only the target workbook (saves first), leaves Excel running.
• Backup: Creates a timestamped backup copy of the workbook in the /backup folder.

SYNC/RESTORE FUNCTIONS:
• Sync Excel from Code: Synchronizes all VBA components from external files into the workbook. Handles standard modules (.bas), Excel objects (sheets/ThisWorkbook .cls), and class modules (.cls). Creates a backup before syncing.
• Recover: Backs up the current workbook with 'xxx_' prefix, then lets you restore from one of the last 5 backups.

PROJECT ACTIONS:
• Backup Project: Creates a ZIP archive of all project files (excluding .py files) in the /backup folder.
• Project Notes: Opens a text editor for project notes stored in notes.txt. Auto-saves on modification.
• Export VBA Components: Exports all VBA components (classes, modules, sheets) from the workbook to .cls/.bas files in the directory. Overwrites existing files.
• Copy to Directory: Copies this application to another directory and optionally opens it there.

DIRECTORY ACCESS (Right Panel):
• VSCode: Opens the current directory in Visual Studio Code.
• PowerShell: Opens a new PowerShell window in the current directory.
• File Explorer: Opens Windows File Explorer in the current directory.

WORKBOOK CONTENT DISPLAY (Right Panel):
Shows all sheets, modules, and classes in the workbook with checkmarks indicating whether corresponding external files exist in the directory.

WORKFLOW TIPS:
1. Use 'Export VBA Components' first to create external files
2. Edit .cls/.bas files in your preferred editor
3. Use 'Sync Excel from Code' to update the workbook with all changes
4. Always backup before major changes (or use the auto-backup in sync)
5. Use 'Get Status' to verify workbook state before syncing

---
For more information, see the README file in your project directory.
Developed by shalmanassar 2025, Nov 30
"""
    
    text.insert("1.0", help_text)
    text.config(state="disabled")
    tk.Button(help_win, text="Close", command=help_win.destroy).pack(pady=10)

def copy_to_directory():
    target_dir = filedialog.askdirectory(title="Select destination directory")
    if not target_dir:
        return
    
    try:
        script_name = os.path.basename(__file__)
        target_path = os.path.join(target_dir, script_name)
        shutil.copy2(__file__, target_path)
        
        if messagebox.askyesno("Copy Complete", f"Application copied to:\n{target_path}\n\nOpen the new location?"):
            subprocess.Popen(["python", target_path], cwd=target_dir)
    except Exception as e:
        messagebox.showerror("Copy Error", f"Failed to copy application:\n{e}")

# --- EXIT Button ---
def exit_app():
    root.destroy()

# --- GUI Layout ---

root = tk.Tk()
root.title("Excel Project Sync")
root.geometry("520x900")
root.attributes('-topmost', True)  # Keep window on top by default

# --- Topmost Toggle ---
def toggle_topmost():
    current = bool(root.attributes('-topmost'))
    root.attributes('-topmost', not current)
    topmost_btn.config(text=f"Always On Top: {'ON' if not current else 'OFF'}")

# --- Status Footer ---

status_var = tk.StringVar()
status_var.set("")

def set_status(msg):
    status_var.set(msg)
    root.update_idletasks()

# Load settings and initialize target/project
_settings = load_settings()
persist_target = _settings.get("last_target_path")
persist_project_dir = _settings.get("last_project_dir")

def set_current_target(target_path, working_dir):
    global xlsm_path, xlsm_name, project_dir
    xlsm_path = target_path
    xlsm_name = os.path.basename(target_path) if target_path else None
    project_dir = working_dir if working_dir else (os.path.dirname(target_path) if target_path else None)
    data = load_settings()
    data["last_target_path"] = xlsm_path
    data["last_project_dir"] = project_dir
    save_settings(data)
    # Update UI if available
    try:
        file_lbl.config(text=f"Current workbook: {xlsm_name or 'None selected'}")
        # update_component_list() call removed; will be scheduled after GUI setup
    except Exception:
        pass

# Initialize from persisted settings if valid
if persist_target and os.path.exists(persist_target):
    set_current_target(persist_target, persist_project_dir if persist_project_dir else os.path.dirname(persist_target))
else:
    set_current_target(None, persist_project_dir if persist_project_dir and os.path.isdir(persist_project_dir) else None)

# --- Top Menu Buttons ---
menu_frame = tk.Frame(root, bg="#f0f0f0", relief="raised", bd=1)
menu_frame.grid(row=0, column=0, columnspan=2, sticky="ew", padx=0, pady=0)

# Add Always On Top toggle button
topmost_btn = tk.Button(menu_frame, text="Always On Top: ON", command=toggle_topmost, width=16)
topmost_btn.pack(side="left", padx=2, pady=2)

def change_target_file():
    initial_dir = project_dir if project_dir else (os.path.dirname(xlsm_path) if xlsm_path else script_dir)
    filetypes = [("Excel Sync Workbooks (.xlsm/.xlsb)", "*.xlsm *.xlsb"), ("All files", "*.*")]
    fp = filedialog.askopenfilename(title="Select target Excel file", initialdir=initial_dir, filetypes=filetypes)
    if not fp:
        return
    # Ask where to work: in-place or copy
    choice = messagebox.askyesno(
        "Working Location",
        "Use the target's directory for extracted files and backups?\n\nYes = Use in-place\nNo = Copy the workbook to a new working directory",
        parent=root,
    )
    working_dir = None
    target_for_use = fp
    if not choice:
        wd = filedialog.askdirectory(title="Select new working directory")
        if not wd:
            return
        # Copy the workbook
        try:
            dst = os.path.join(wd, os.path.basename(fp))
            shutil.copy2(fp, dst)
            target_for_use = dst
            working_dir = wd
            # Ask about copying code files
            if messagebox.askyesno("Copy Code Files", "Also copy any existing .bas/.cls files from the source folder?", parent=root):
                src_dir = os.path.dirname(fp)
                for pattern in ("*.bas", "*.cls"):
                    for f in glob.glob(os.path.join(src_dir, pattern)):
                        try:
                            shutil.copy2(f, os.path.join(wd, os.path.basename(f)))
                        except Exception:
                            pass
            # Ask about copying backups
            src_backup = os.path.join(os.path.dirname(fp), "backup")
            if os.path.isdir(src_backup) and messagebox.askyesno("Copy Backups", "Copy existing backups to the new working directory?", parent=root):
                dst_backup = os.path.join(wd, "backup")
                os.makedirs(dst_backup, exist_ok=True)
                for f in glob.glob(os.path.join(src_backup, "*")):
                    try:
                        if os.path.isfile(f):
                            shutil.copy2(f, os.path.join(dst_backup, os.path.basename(f)))
                    except Exception:
                        pass
            # Open the working directory in Explorer for convenience
            try:
                subprocess.Popen(["explorer", wd])
            except Exception:
                pass
        except Exception as e:
            messagebox.showerror("Copy Failed", f"Failed to copy workbook to working directory:\n{e}")
            return
    else:
        working_dir = os.path.dirname(fp)
    set_current_target(target_for_use, working_dir)

tk.Button(menu_frame, text="Change Target", command=change_target_file, width=12).pack(side="left", padx=2, pady=2)
tk.Button(menu_frame, text="Copy to Dir", command=copy_to_directory, width=10).pack(side="left", padx=2, pady=2)
tk.Button(menu_frame, text="Help", command=show_help, width=8).pack(side="left", padx=2, pady=2)
tk.Button(menu_frame, text="About", command=show_about, width=8).pack(side="left", padx=2, pady=2)
tk.Button(menu_frame, text="Exit", command=exit_app, width=8).pack(side="right", padx=2, pady=2)

# --- Title and Current Workbook ---
title_frame = tk.Frame(root)
title_frame.grid(row=1, column=0, columnspan=2, sticky="ew", padx=10, pady=(10,0))
title_lbl = tk.Label(title_frame, text="Excel VBA Project Sync Utility", font=("Arial", 16, "bold"))
title_lbl.pack(side="top", anchor="w")
file_lbl = tk.Label(title_frame, text=f"Current workbook: {xlsm_name or 'None selected'}", font=("Arial", 12, "italic"))
file_lbl.pack(side="top", anchor="w")

# Target selection list is rendered in right panel when no target is selected

# --- Scrollable Frame for Left Column ---
left_container = tk.Frame(root)
left_container.grid(row=2, column=0, sticky="nsew", padx=10, pady=10)

canvas = tk.Canvas(left_container)
scrollbar = tk.Scrollbar(left_container, orient="vertical", command=canvas.yview)
scrollable_frame = tk.Frame(canvas)

scrollable_frame.bind(
    "<Configure>",
    lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
)

canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
canvas.configure(yscrollcommand=scrollbar.set)

canvas.pack(side="left", fill="both", expand=True)
scrollbar.pack(side="right", fill="y", padx=(10,0))

# --- Right Column: Workbook Content Listing ---
right_frame = tk.Frame(root)
right_frame.grid(row=2, column=1, rowspan=100, sticky="nsew", padx=(20,10), pady=10)

# Flag to prevent infinite recursion in update_component_list
_updating_components = False


def update_component_list():
    global _updating_components
    if _updating_components:
        return
    _updating_components = True
    try:
        # For backward compatibility, call with no args (will fallback to old impl)
        _update_component_list_impl()
    finally:
        _updating_components = False

def _update_component_list_impl(sheets=None, modules=None, classes=None):
    for widget in right_frame.winfo_children():
        widget.destroy()
    
    # Directory access buttons - always visible at top
    dir_access_frame = tk.Frame(right_frame)
    dir_access_frame.pack(fill="x", pady=(0,10))
    tk.Label(dir_access_frame, text="Open Directory", font=("Arial", 12, "bold")).pack(anchor="w")
    btn_frame = tk.Frame(dir_access_frame)
    btn_frame.pack(anchor="w", pady=(5,0))
    tk.Button(btn_frame, text="VSCode", command=open_vscode, width=10).pack(side="left", padx=(0,2))
    tk.Button(btn_frame, text="PowerShell", command=open_powershell, width=10).pack(side="left", padx=2)
    tk.Button(btn_frame, text="Explorer", command=open_file_explorer, width=10).pack(side="left", padx=2)
    
    # Directory info
    current_dir = project_dir if project_dir else script_dir
    tk.Label(dir_access_frame, text=f"Directory: {current_dir}", font=("Arial", 9), wraplength=220).pack(anchor="w", pady=(5,0))
    prov = detect_cloud_provider(current_dir)
    if prov:
        tk.Label(dir_access_frame, text=f"Detected: {prov}", font=("Arial", 9, "italic"), fg="#555555").pack(anchor="w")
    
    # Separator
    sep = tk.Frame(right_frame, height=1, bg="#cccccc")
    sep.pack(fill="x", pady=(10,10))
    
    # Status/Error message (above directory info)
    status_msg = status_var.get()
    show_try_open = False
    if status_msg:
        color = "red" if "error" in status_msg.lower() or "fail" in status_msg.lower() or "timeout" in status_msg.lower() else "#444444"
        tk.Label(right_frame, text=status_msg, fg=color, font=("Arial", 10, "bold"), wraplength=220, justify="left").pack(anchor="w", pady=(2,8))
        # Show Try Open Now button if error/timeout
        if color == "red" and ("open" in status_msg.lower() or "timeout" in status_msg.lower() or "fail" in status_msg.lower()):
            def try_open_now_action():
                set_status("Trying to open workbook now...")
                excel = None
                wb = None
                try:
                    excel, wb = open_excel_workbook_with_timeout(xlsm_path, timeout_sec=25, retry_attempts=0)
                    # Get components from the opened workbook
                    vbproj = wb.VBProject
                    sheets_, modules_, classes_ = [], [], []
                    for comp in vbproj.VBComponents:
                        name = comp.Name
                        if comp.Type == 100:
                            exists = os.path.exists(os.path.join(project_dir if project_dir else script_dir, f"{name}.cls"))
                            sheets_.append((name, exists))
                        elif comp.Type == 1:
                            exists = os.path.exists(os.path.join(project_dir if project_dir else script_dir, f"{name}.bas"))
                            modules_.append((name, exists))
                        elif comp.Type == 2:
                            exists = os.path.exists(os.path.join(project_dir if project_dir else script_dir, f"{name}.cls"))
                            classes_.append((name, exists))
                    wb.Close(False)
                    excel.Quit()
                    set_status("")  # Clear error status on success
                    _update_component_list_impl(sheets_, modules_, classes_)
                except Exception as e:
                    # Ensure Excel is closed on error
                    try:
                        if wb:
                            wb.Close(False)
                    except Exception:
                        pass
                    try:
                        if excel:
                            excel.Quit()
                    except Exception:
                        pass
                    set_status(f"Try Open Now failed: {e}")
                    update_component_list()
            btn = tk.Button(right_frame, text="Try Open Now", command=try_open_now_action, width=14, fg="blue")
            btn.pack(anchor="w", pady=(2,8))
    if not xlsm_path or not os.path.exists(xlsm_path):
        info = tk.Label(right_frame, text="No target selected.", fg="gray")
        info.pack(anchor="w", pady=(10,4))
        base_dir = project_dir if project_dir else script_dir
        tk.Label(right_frame, text=f"Detected in: {base_dir}").pack(anchor="w")
        files = [f for f in os.listdir(base_dir) if f.lower().endswith((".xlsm", ".xlsb"))]
        if files:
            listbox = tk.Listbox(right_frame, height=min(8, len(files)), exportselection=False)
            for f in files:
                listbox.insert("end", f)
            listbox.pack(fill="x", padx=2, pady=4)
            def choose_from_list():
                sel = listbox.curselection()
                if not sel:
                    return
                sel_file = os.path.join(base_dir, listbox.get(sel[0]))
                set_current_target(sel_file, base_dir)
            tk.Button(right_frame, text="Use Selected", command=choose_from_list, width=12).pack(anchor="w", pady=(2,6))
        else:
            tk.Label(right_frame, text="No .xlsm/.xlsb files found.", fg="red").pack(anchor="w", pady=(4,6))
        tk.Button(right_frame, text="Browse...", command=change_target_file, width=12).pack(anchor="w")
        return
    # If no data provided, fallback to slow call (for legacy direct calls)
    if sheets is None or modules is None or classes is None:
        sheets, modules, classes = get_vba_component_lists()
        # If get_vba_component_lists failed (returned empty AND status has error), schedule UI refresh
        if not sheets and not modules and not classes and status_var.get() and "fail" in status_var.get().lower():
            root.after(10, update_component_list)
            return
    # Content listing
    content_frame = tk.Frame(right_frame)
    content_frame.pack(fill="both", expand=True)
    tk.Label(content_frame, text="Sheets", font=("Arial", 12, "bold")).pack(anchor="w", pady=(10,0))
    for name, exists in sheets:
        tk.Label(content_frame, text=f"{name} {'✔' if exists else '✖'}", fg="green" if exists else "red").pack(anchor="w")
    tk.Label(content_frame, text="Modules", font=("Arial", 12, "bold")).pack(anchor="w", pady=(10,0))
    for name, exists in modules:
        tk.Label(content_frame, text=f"{name} {'✔' if exists else '✖'}", fg="green" if exists else "red").pack(anchor="w")
    tk.Label(content_frame, text="Classes", font=("Arial", 12, "bold")).pack(anchor="w", pady=(10,0))
    for name, exists in classes:
        tk.Label(content_frame, text=f"{name} {'✔' if exists else '✖'}", fg="green" if exists else "red").pack(anchor="w")




# Show one-time trust warning after UI exists
maybe_warn_trust_once()

row = 0  # Start main button column in scrollable frame

def add_separator_with_header(row, header_text):
    sep = tk.Frame(scrollable_frame, height=2, bd=1, relief="sunken", bg="#cccccc")
    sep.grid(row=row, column=0, sticky="ew", padx=10, pady=(10,5))
    header = tk.Label(scrollable_frame, text=header_text, font=("Arial", 11, "bold"), fg="#333333")
    header.grid(row=row+1, column=0, padx=10, pady=(5,10), sticky="w")
    return row + 2

def add_button_with_desc(row, text, command, desc):
    btn = tk.Button(scrollable_frame, text=text, command=command, height=1, width=23)
    btn.grid(row=row, column=0, padx=10, pady=(5,0), sticky="w")
    lbl = tk.Label(scrollable_frame, text=desc, anchor="nw", justify="left", wraplength=180, font=("Arial", 8))
    lbl.grid(row=row+1, column=0, padx=10, pady=(0,5), sticky="ew")
    return row + 2

# --- Group 1: File Status ---
row = add_separator_with_header(row, "File Status")
row = add_button_with_desc(row, "Get Status", get_status, "Show if workbook is open, last save, last backup.")
row = add_button_with_desc(row, "Open Excel", open_excel, "Open the workbook for editing/testing.")
row = add_button_with_desc(row, "Close Excel", close_excel, "Close only the target workbook.")
row = add_button_with_desc(row, "Backup", backup, "Create a timestamped backup of the workbook.")

# --- Group 2: Sync/Restore ---
row = add_separator_with_header(row, "Sync/Restore")
row = add_button_with_desc(row, "Sync Excel from Code", sync_excel_from_code, "Sync all VBA components: standard modules (.bas), Excel objects (sheets/workbook .cls), and class modules (.cls).")
row = add_button_with_desc(row, "Recover", recover, "Backup current file, then restore from one of the last five backups.")

# --- Group 3: Project Actions ---
row = add_separator_with_header(row, "Project Actions")
row = add_button_with_desc(row, "Backup Project", backup_project, "Zip all project files (except .py) to /backup.")
row = add_button_with_desc(row, "Project Notes", open_notes, "Open and edit project notes in notes.txt.")
row = add_button_with_desc(row, "Export VBA Components", export_vba_components,
    "Export all classes, modules, and sheet objects from the workbook to this directory. Overwrites existing files.")

# --- Footer ---
footer_lbl = tk.Label(scrollable_frame, text="shalmanassar 2025, Nov. 30", font=("Arial", 8, "italic"), anchor="e", fg="#666666")
footer_lbl.grid(row=row+1, column=0, sticky="se", padx=10, pady=10)

# Configure grid weights
root.grid_rowconfigure(2, weight=1)
root.grid_columnconfigure(0, weight=1)
left_container.grid_rowconfigure(0, weight=1)
left_container.grid_columnconfigure(0, weight=1)
scrollable_frame.grid_columnconfigure(0, weight=1)

# Bind mousewheel to canvas
def _on_mousewheel(event):
    canvas.yview_scroll(int(-1*(event.delta/120)), "units")
canvas.bind_all("<MouseWheel>", _on_mousewheel)

# Initialize the right panel immediately (without Excel operations)
update_component_list()

root.mainloop()