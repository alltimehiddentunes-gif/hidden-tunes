#!/bin/bash
set -e
cd /home/wills/hidden-tunes-app
GIT_EDITOR=true git commit -m "Reconstruct desktop home page for PSD parity"
git log -1 --stat
git status --short hidden-tunes-desktop/
