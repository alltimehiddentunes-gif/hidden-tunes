#!/usr/bin/env python3
"""Crop hero and theater card regions from uploaded PSD reference."""
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    raise SystemExit('Pillow required: python3 -m pip install pillow')

ROOT = Path(__file__).resolve().parents[1]
REF = Path(
    '/mnt/c/Users/Wills/.cursor/projects/c-Users-Wills-Desktop-HiddenTunes/assets/'
    'c__Users_Wills_AppData_Roaming_Cursor_User_workspaceStorage_848c9a78b1443d76499702f5f50a926d_images_'
    'image-ff140dcb-bde8-467b-9b85-34152eb40f31.png'
)
OUT = ROOT / 'src' / 'assets'

img = Image.open(REF)
w, h = img.size
print(f'reference size: {w}x{h}')

hero = img.crop((int(w * 0.13), int(h * 0.07), int(w * 0.70), int(h * 0.34)))
hero.save(OUT / 'emotional-worlds-hero.png')

theater = img.crop((int(w * 0.72), int(h * 0.62), int(w * 0.98), int(h * 0.88)))
theater.save(OUT / 'theater-mode-card.png')

print('wrote emotional-worlds-hero.png and theater-mode-card.png')
