#!/usr/bin/env python3
from pathlib import Path
p = Path(__file__).resolve().parents[1] / 'src/lib/desktopPlayback/types.ts'
t = p.read_text(encoding='utf-8').replace('\r\n', '\n').replace('\r', '\n')
p.write_text(t, encoding='utf-8', newline='\n')
print('Normalized types.ts newlines')
