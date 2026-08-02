# Root cause

`useGlobalDesktopSearch` retained correct family types, but `GlobalSearchSections` reduced TV and Radio results to `(id, title, artwork)`. `DiscoverPage` reconstructed incomplete objects, discarding country, language, categories/tags, quality/reliability, protocol, verification, popularity, and description. The entire card was also Play, so navigation and playback lacked independent contracts. The fix passes canonical objects, makes card navigation explicit, and uses a separate Play button with stopped propagation.
