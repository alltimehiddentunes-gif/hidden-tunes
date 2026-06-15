#!/usr/bin/env python3
from pathlib import Path
import importlib.util

spec = importlib.util.spec_from_file_location(
    "phase42a",
    Path(__file__).resolve().parent / "phase42a_emotional_worlds.py",
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

wsl_root = Path("/home/wills/hidden-tunes-app/hidden-tunes-desktop")
path = wsl_root / "src" / "App.css"
css = path.read_text(encoding="utf-8")
# reuse block from patch function
block_start = css.find("/* —— Phase 42A:")
if block_start < 0:
    # extract block from module source
    src = (Path(__file__).parent / "phase42a_emotional_worlds.py").read_text(encoding="utf-8")
    start = src.find("    block = '''")
    end = src.find("'''\n    if \"Phase 42A", start)
    block = src[start + len("    block = '''") : end]
    path.write_text(css + block, encoding="utf-8")
    print("App.css updated")
