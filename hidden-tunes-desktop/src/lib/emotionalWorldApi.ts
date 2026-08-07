import { getDesktopRuntimeConfig } from './config/desktopRuntimeConfig'
import type { ApiSong } from './api'
import type { EmotionalWorldId } from './emotionalWorlds'

export type BackendWorldSummary = { id: EmotionalWorldId; name: string; description: string; family: string; status: 'active' | 'beta'; priority: number; artworkKey: string; playableCount: number; intelligenceVersion: string }
export type BackendWorldRegistry = { intelligenceVersion: string; catalogVersion: string; generatedAt: string; worlds: BackendWorldSummary[] }
export type BackendWorldCatalog = { counts: { highConfidence: number; strong: number; broadened: number; totalPlayable: number }; songs: ApiSong[]; nextCursor?: string; intelligenceVersion: string; catalogVersion: string; generatedAt: string }

async function fetchJson(path: string, signal?: AbortSignal) {
  const base = getDesktopRuntimeConfig().adminCatalogBaseUrl
  if (!base) throw new Error('Emotional Worlds backend is not configured.')
  const response = await fetch(`${base}${path}`, { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Emotional Worlds backend returned ${response.status}.`)
  return response.json() as Promise<unknown>
}

export async function fetchEmotionalWorlds(songs: ApiSong[], signal?: AbortSignal) {
  const registry = await fetchJson('/api/music/emotional-worlds', signal) as BackendWorldRegistry
  if (!registry || !Array.isArray(registry.worlds) || !registry.intelligenceVersion) throw new Error('Invalid Emotional Worlds registry response.')
  const approved = registry.worlds.filter((world) => world.status === 'active' || world.status === 'beta')
  const byId = new Map(songs.map((song) => [song.id, song]))
  const entries = await Promise.all(approved.map(async (world) => {
    const payload = await fetchJson(`/api/music/emotional-worlds/${encodeURIComponent(world.id)}?limit=100`, signal) as { counts: BackendWorldCatalog['counts']; songs: Array<{ songId: string }>; nextCursor?: string; intelligenceVersion: string; catalogVersion: string; generatedAt: string }
    if (!payload || !Array.isArray(payload.songs) || !payload.counts) throw new Error(`Invalid ${world.id} catalog response.`)
    const rankedSongs = payload.songs.map((entry) => byId.get(entry.songId)).filter((song): song is ApiSong => Boolean(song))
    return [world.id, { counts: payload.counts, songs: rankedSongs, nextCursor: payload.nextCursor, intelligenceVersion: payload.intelligenceVersion, catalogVersion: payload.catalogVersion, generatedAt: payload.generatedAt }] as const
  }))
  return { registry: { ...registry, worlds: approved }, catalogs: new Map(entries) }
}
