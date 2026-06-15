#!/usr/bin/env python3
from pathlib import Path
p = Path(__file__).resolve().parents[1] / 'src/App.tsx'
text = p.read_text()
text = text.replace(
    '  setPlaylistsQuery,\n}: {\n  page: PageId',
    "  setPlaylistsQuery,\n  libraryQuery = '',\n}: {\n  page: PageId",
)
text = text.replace(
    '  setPlaylistsQuery?: (value: string) => void\n}) {\n  void _onOpenMood',
    '  setPlaylistsQuery?: (value: string) => void\n  libraryQuery?: string\n}) {\n  void _onOpenMood',
)
text = text.replace("  const showOverview = tab === 'Overview'\n", '')
p.write_text(text)
print('fixed')
