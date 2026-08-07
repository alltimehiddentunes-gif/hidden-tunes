import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const registry = fs.readFileSync(path.join(root, 'src/lib/emotionalWorlds.ts'), 'utf8')
const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')
const artwork = fs.readFileSync(path.join(root, 'src/data/artworkRegistry.ts'), 'utf8')
const api = fs.readFileSync(path.join(root, 'src/lib/emotionalWorldApi.ts'), 'utf8')
const worlds = ['calm', 'chill', 'happy', 'romantic', 'motivational', 'melancholy', 'energetic']

for (const world of worlds) {
  if (!registry.includes(`id: '${world}'`)) throw new Error(`Missing world profile: ${world}`)
  if (!artwork.includes(`emotional-world-${world}.png`)) throw new Error(`Missing artwork registry entry: ${world}`)
  if (!fs.existsSync(path.join(root, `public/artwork/worlds/emotional-world-${world}.png`))) throw new Error(`Missing artwork file: ${world}`)
}
if (!registry.includes('isPlayableMediaUrl')) throw new Error('World catalog lacks playability gate')
if (!registry.includes('excluded')) throw new Error('World profiles lack exclusion tokens')
if (!app.includes("'emotional-world'")) throw new Error('World playback context is missing')
if (!app.includes('fetchEmotionalWorlds')) throw new Error('Desktop does not consume backend Emotional Worlds')
if (!app.includes('if (backendFailed) return new Map([...fallbackCatalogs]')) throw new Error('Fallback is not failure-gated')
if (!app.includes('backendCatalogs?.get') && !app.includes('catalog?.counts?.totalPlayable')) throw new Error('Counts are not backend-derived')
if (!api.includes('entry.songId') || !api.includes('byId.get')) throw new Error('Backend-ranked IDs are not resolved through canonical catalog')
if (!app.includes('buildQueueSeedPool')) throw new Error('World queue seed integration is missing')
if (/label=\{card\.title\}[\s\S]{0,100}fallbackInitial/.test(app)) throw new Error('World card may render placeholder initials')
console.log(`PASS emotional-worlds-contract: ${worlds.length} profiles, assets, ranked playable queues, canonical context`)
