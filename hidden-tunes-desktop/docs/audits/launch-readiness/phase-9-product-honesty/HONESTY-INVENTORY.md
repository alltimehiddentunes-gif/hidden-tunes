# Honesty Inventory

| Surface | Action/claim | Current (before) | Real capability | Honest? | Required action | After |
|---------|--------------|------------------|-----------------|--------:|-----------------|-------|
| Sports card | Play | Shown when API `isPlayable` | Streams off on mobile | No | Kill-switch + hide Play | Fixed |
| Sports details | Play / browse hint | Play + “Marked playable” | Streams off | No | Streams-off copy | Fixed |
| Sports dispatch | POST /play | Ran when Play clicked | Should not while streams off | Partial | Early return | Fixed |
| Music Downloads section | Stub “not available” | Dishonest | Real Downloads exist | No | Route to Downloads | Fixed |
| Music SubNav | No Downloads | Hidden | Real Downloads | Unclear | Tab → real Downloads | Fixed |
| Home Downloads quick | nav downloads | Real page | Working | Yes | Keep | Keep |
| Sidebar Downloads | Real page | Working | Working | Yes | Keep | Keep |
| Follow | Sign-in message | Inline dead-end | No sign-in UI | No | Account gate dialog | Fixed |
| Sidebar profile | “Hidden Listener” | Fake identity | Local preview | No | Local preview label | Fixed |
| Premium sidebar | “coming soon” | Soft | No checkout | Partial | Purchasing unavailable | Fixed |
| Premium page | Coming soon lists | Honest preview | No checkout | Yes | Keep | Keep |
| Notifications | “coming soon” | Disabled | Not available | Partial | Preview-unavailable copy | Fixed |
| Settings Appearance/Playback nav | Disabled blank | Dead ends | Quality exists below | No | Truthful disabled hints | Fixed |
| Settings accent slider | Decorative fake | Looked interactive | Fixed theme | No | Removed | Fixed |
| Settings updates | Missing | — | No auto-update | — | Explicit not available | Fixed |
| Auto-update | — | None | None | — | Document only | Honest |

## Totals (post-fix)

| Class | Count |
|-------|------:|
| Functional | Many (catalog/playback/downloads) |
| Gated (account) | Follow |
| Hidden | Sports Play when streams off |
| Disabled truthfully | Settings nav, notifications |
| Repaired | Sports, Downloads stub, Follow, Settings/Premium chrome |
| Remaining incomplete | Full auth, billing, Settings depth, auto-update |
