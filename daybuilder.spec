# -*- mode: python ; coding: utf-8 -*-
# DayBuilder PyInstaller spec — builds bootstrap.exe
# Usage: pyinstaller daybuilder.spec

a = Analysis(
    ['bootstrap.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=['flask', 'openpyxl', 'tkinter'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['matplotlib', 'numpy', 'pandas', 'scipy', 'PIL', 'pytest'],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='RMA Job Tracking Launcher',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    icon=None,
)
