#!/usr/bin/env python3
import subprocess

subprocess.run(["git", "add", "src/App.tsx", "src/App.css", "src/index.css"], check=True)
subprocess.run(
    ["git", "commit", "-m", "Rebuild desktop sidebar brand for PSD parity"],
    check=True,
)
subprocess.run(["git", "log", "-1", "--oneline"], check=True)
subprocess.run(["git", "diff", "--check"], check=True)
subprocess.run(["git", "status", "--short"], check=True)
