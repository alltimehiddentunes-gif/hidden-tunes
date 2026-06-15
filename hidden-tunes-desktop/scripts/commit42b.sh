#!/bin/bash
set -euo pipefail
cd /home/wills/hidden-tunes-app/hidden-tunes-desktop
git add src/App.tsx src/App.css \
  src/assets/psd-search-reference.jpg \
  src/assets/psd-library-reference.jpg \
  src/assets/psd-playlists-reference.jpg \
  src/assets/psd-artists-reference.jpg \
  src/assets/psd-albums-reference.jpg \
  src/assets/psd-liked-reference.jpg
git commit -m "Rebuild desktop remaining pages for PSD parity"
git rev-parse HEAD
git show --stat --oneline -1
