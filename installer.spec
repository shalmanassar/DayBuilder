# -*- mode: python ; coding: utf-8 -*-
# DayBuilder Installer PyInstaller spec
# Usage: pyinstaller installer.spec

a = Analysis(
    ['installer.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=['tkinter'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['flask', 'openpyxl', 'matplotlib', 'numpy', 'pandas', 'scipy', 'PIL', 'pytest'],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='DayBuilder Installer',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    icon='JobLogICON.ico',
)
