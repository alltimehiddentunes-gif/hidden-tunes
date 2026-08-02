import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const page = fs.readFileSync(path.join(root, 'src/components/tv/TvPage.tsx'), 'utf8')
const data = fs.readFileSync(path.join(root, 'src/lib/tv/useTvPageData.ts'), 'utf8')
let failed = 0
const check = (label, condition) => {
  console.log(`${condition ? 'PASS' : 'FAIL'}: ${label}`)
  if (!condition) failed += 1
}

check('category selection remains an effective API filter', data.includes('const effectiveSelectedCategory = selectedCategory'))
check('region selection remains an effective API filter', data.includes('const effectiveSelectedRegion = selectedRegion'))
check('filtered Search sends category to canonical TV catalog', data.includes('searchTvChannels(trimmedSearch') && data.includes('category,'))
check('filtered Search sends country to canonical TV catalog', data.includes('country: effectiveSelectedRegion'))
check('category click selects category', page.includes('setSelectedCategory(label)'))
check('category click clears region', /handleCategorySelect[\s\S]*?setSelectedRegion\(null\)/.test(page))
check('region click selects region', page.includes('setSelectedRegion(name)'))
check('region click clears category', /handleRegionSelect[\s\S]*?setSelectedCategory\(null\)/.test(page))
check('browse click reveals real catalog', page.includes("scrollIntoView({ behavior: 'smooth', block: 'start' })"))
check('catalog is the reveal target', page.includes('<section ref={catalogRef} className="tv-section"'))
check('tab changes clear stale browse filters', /handleFilterChange[\s\S]*?setSelectedCategory\(null\)[\s\S]*?setSelectedRegion\(null\)/.test(page))
check('category cards share canonical handler', (page.match(/handleCategorySelect\(category\.label\)/g) || []).length === 2)
check('region cards use canonical handler', page.includes('handleRegionSelect(region.code ?? region.name)'))
check('pagination retains query key filters', data.includes("effectiveSelectedCategory ?? ''") && data.includes("effectiveSelectedRegion ?? ''"))
check('pagination exposes a visible Load More action', page.includes('className="btn-secondary btn-sm tv-load-more-btn"') && page.includes('onClick={loadMore}'))
check('playback still uses canonical filtered queue', page.includes("playChannel(channel, queue, 'TV Channels')"))

console.log(`\nTV browse routing: ${16 - failed} passed, ${failed} failed`)
if (failed) process.exit(1)
