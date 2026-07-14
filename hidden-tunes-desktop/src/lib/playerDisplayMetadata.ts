import { resolveArtistPortrait, resolveSongArtwork } from '../data/artworkRegistry'
import type { ApiSong } from './api'
import {
  selectPlayableUrlForQualityMode,
  type AudioVersionTier,
  type PlayableUrlInput,
} from './audioVersions'
import type { AudioQualityMode } from './localPreferences'

export const PLAYER_IDLE_TITLE = 'Nothing playing'
export const PLAYER_IDLE_ARTIST = 'Select a song to begin'
export const PLAYER_UNKNOWN_TITLE = 'Unknown Title'
export const PLAYER_UNKNOWN_ARTIST = 'Unknown Artist'

const AUDIO_TIER_LABELS: Record<AudioVersionTier, string> = {
  ultraLight: 'Ultra Light',
  previewUrl: 'Ultra Light',
  standard: 'Standard',
  legacyAudioUrl: 'Original',
  highQuality: 'High Quality',
  lossless: 'Original',
}

const QUALITY_MODE_DISPLAY_LABELS: Record<AudioQualityMode, string> = {
  auto: 'Auto',
  'data-saver': 'Ultra Light',
  standard: 'Standard',
  'high-quality': 'High Quality',
}

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function resolvePlayerTitle(track: ApiSong | null | undefined): string {
  if (!track) return PLAYER_IDLE_TITLE
  return normalizeText(track.title) ?? PLAYER_UNKNOWN_TITLE
}

export function resolvePlayerArtist(track: ApiSong | null | undefined): string {
  if (!track) return PLAYER_IDLE_ARTIST
  return normalizeText(track.artist) ?? PLAYER_UNKNOWN_ARTIST
}

export function resolvePlayerAlbum(
  track: ApiSong | null | undefined,
  queueTitle: string | null | undefined,
  isActive: boolean,
): string | null {
  const album = normalizeText(track?.album)
  if (album) return album
  if (isActive) return normalizeText(queueTitle)
  return null
}

export function resolvePlayerTrackArtwork(track: ApiSong | null | undefined): string | null {
  const direct = resolveSongArtwork(track)
  if (direct) return direct
  if (!track) return null

  return resolveArtistPortrait({
    id: track.artistId ?? track.id,
    name: track.artist,
    artwork: null,
    songCount: 0,
    tracks: [],
  })
}

export function resolvePlayerQualityLabel(
  track: PlayableUrlInput | null | undefined,
  audioQualityMode: AudioQualityMode,
  isActive: boolean,
): string | null {
  if (!isActive) return null

  if (track) {
    const selection = selectPlayableUrlForQualityMode(track, audioQualityMode)
    if (selection) {
      return AUDIO_TIER_LABELS[selection.tier] ?? 'Unknown'
    }
  }

  return QUALITY_MODE_DISPLAY_LABELS[audioQualityMode] ?? 'Auto'
}

export type PlayerShellMetadataInput = {
  currentTrack: ApiSong | null
  preferredTrack?: ApiSong | null
  queueTitle?: string | null
  audioQualityMode: AudioQualityMode
}

export type PlayerShellMetadata = {
  displayTrack: ApiSong | null
  isActive: boolean
  displayTitle: string
  displayArtist: string
  displayAlbum: string | null
  displayArtwork: string | null
  qualityLabel: string | null
  activeTrackId: string | null
}

export function resolvePlayerShellMetadata({
  currentTrack,
  preferredTrack = null,
  queueTitle = null,
  audioQualityMode,
}: PlayerShellMetadataInput): PlayerShellMetadata {
  const displayTrack = currentTrack ?? preferredTrack ?? null
  const isActive = Boolean(displayTrack && currentTrack?.id === displayTrack.id)

  return {
    displayTrack,
    isActive,
    displayTitle: resolvePlayerTitle(displayTrack),
    displayArtist: resolvePlayerArtist(displayTrack),
    displayAlbum: resolvePlayerAlbum(displayTrack, queueTitle, isActive),
    displayArtwork: resolvePlayerTrackArtwork(displayTrack),
    qualityLabel: resolvePlayerQualityLabel(displayTrack, audioQualityMode, isActive),
    activeTrackId: displayTrack?.id ?? null,
  }
}
