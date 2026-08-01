# Interaction Matrix

| Action | Result |
|--------|--------|
| Hero Play | Existing playback owner; Home stays |
| Personal/Catalogue Mix Play | Seeds queue; Home stays |
| Quick access | Navigates; does not stop media |
| Recently Added card | Play bounded rail |
| Recently Played card | Play history queue |
| Album body | Opens album details |
| Album Play | Seeds album queue on Home |
| Artist card | Opens artist details |
| Mood Room | Plays matched room queue |
| Emotional World | Plays lane tracks |
| Genre card | `genre:{slug}` search intent |
| Family card | Family route; playback preserved |
| Load More | Extends All Songs window |

No route hijack to PlayerWorkspace for `context === 'home'`.
