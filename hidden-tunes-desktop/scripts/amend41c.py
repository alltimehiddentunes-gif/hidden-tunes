#!/usr/bin/env python3
import subprocess

subprocess.run(["git", "add", "src/App.css"], check=True)
subprocess.run(["git", "commit", "--amend", "--no-edit"], check=True)
subprocess.run(["git", "log", "-1", "--oneline"], check=True)
