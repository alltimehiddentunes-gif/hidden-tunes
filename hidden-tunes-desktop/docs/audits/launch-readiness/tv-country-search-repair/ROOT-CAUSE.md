# Root cause

`resolveTvSearchCountryCode` omitted Romania and rejected every raw ISO code. Recognized names triggered both `q=<name>` and `country=<code>`, then merged incompatible pages and totals. Pure country intent was therefore lost at `searchTvChannels`.
