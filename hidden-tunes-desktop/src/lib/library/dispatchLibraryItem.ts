import type { DesktopLibraryItem } from './types'

export type LibraryDispatchAction =
  | { kind: 'play_song'; item: Extract<DesktopLibraryItem, { type: 'song' }> }
  | { kind: 'play_radio'; item: Extract<DesktopLibraryItem, { type: 'radio' }> }
  | { kind: 'open_podcast_show'; item: Extract<DesktopLibraryItem, { type: 'podcast_show' }> }
  | { kind: 'play_podcast_episode'; item: Extract<DesktopLibraryItem, { type: 'podcast_episode' }> }
  | { kind: 'open_audiobook'; item: Extract<DesktopLibraryItem, { type: 'audiobook' }> }
  | { kind: 'play_tv'; item: Extract<DesktopLibraryItem, { type: 'tv' }> }
  | { kind: 'open_motivational'; item: Extract<DesktopLibraryItem, { type: 'motivational' }> }
  | { kind: 'open_lecture'; item: Extract<DesktopLibraryItem, { type: 'lecture' }> }
  | { kind: 'unsupported'; item: DesktopLibraryItem; message: string }

/**
 * Typed open/play routing from Library selection.
 * Never falls back to "play everything as song".
 */
export function dispatchLibraryItem(item: DesktopLibraryItem): LibraryDispatchAction {
  switch (item.type) {
    case 'song':
      return { kind: 'play_song', item }
    case 'radio':
      return { kind: 'play_radio', item }
    case 'podcast_show':
      return { kind: 'open_podcast_show', item }
    case 'podcast_episode':
      return { kind: 'play_podcast_episode', item }
    case 'audiobook':
      return { kind: 'open_audiobook', item }
    case 'tv':
      return { kind: 'play_tv', item }
    case 'motivational':
      return { kind: 'open_motivational', item }
    case 'lecture':
      return { kind: 'open_lecture', item }
    case 'sports':
      return {
        kind: 'unsupported',
        item,
        message: 'Sports favorites are not available on desktop yet.',
      }
    case 'legacy_unknown':
      return {
        kind: 'unsupported',
        item,
        message: 'This saved item has an unknown type and cannot be opened safely.',
      }
    default: {
      const _exhaustive: never = item
      return {
        kind: 'unsupported',
        item: _exhaustive,
        message: 'Unsupported library item.',
      }
    }
  }
}
