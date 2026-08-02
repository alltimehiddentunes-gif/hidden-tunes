# TV Browse root cause

`TvPage` stored a selected category, then changed the active tab to `all`. `useTvPageData` only treated `selectedCategory` as effective while the tab was `genres`, so the category was removed from the canonical `/api/tv/channels` request. Compact cards never entered `genres`, producing the same no-op. Search mode also bypassed selected category/country filters, and region/category clicks did not reveal the catalog section.

The repair makes selected category/country first-class query inputs, clears mutually exclusive filters intentionally, retains them through pagination and Search, scrolls to the real catalog, and adds a visible Load More control alongside automatic pagination.
