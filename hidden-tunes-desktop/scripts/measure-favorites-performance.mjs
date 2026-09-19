import { performance } from 'node:perf_hooks'

const base = Array.from({ length: 40 }, (_, index) => ({
  id: `canonical-${index}`,
  title: `Track ${String(index).padStart(2, '0')}`,
  artist: `Artist ${index % 9}`,
  album: `Album ${index % 7}`,
  artwork: `cover-${index % 12}`,
  likedAt: new Date(Date.now() - index * 60_000).toISOString(),
}))

for (const size of [100, 500, 2000]) {
  const items = Array.from({ length: size }, (_, index) => ({
    ...base[index % base.length],
    id: `${base[index % base.length].id}-fixture-${index}`,
  }))
  const measure = (operation) => {
    const start = performance.now()
    operation()
    return Number((performance.now() - start).toFixed(3))
  }
  const initialMs = measure(() => new Map(items.map((item) => [item.id, item])))
  const searchMs = measure(() => items.filter((item) => [item.title, item.artist, item.album].some((value) => value.toLowerCase().includes('artist 3'))))
  const alphaSortMs = measure(() => [...items].sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id)))
  const recentSortMs = measure(() => [...items].sort((a, b) => Date.parse(b.likedAt) - Date.parse(a.likedAt) || a.id.localeCompare(b.id)))
  const unfavoriteMs = measure(() => items.filter((_, index) => index !== Math.floor(size / 2)))
  const collageMs = measure(() => items.filter((item) => Boolean(item.artwork)).slice(0, 4))
  console.log(JSON.stringify({ size, initialMs, searchMs, alphaSortMs, recentSortMs, unfavoriteMs, collageMs }))
}
