export type MusicNavView =
  | 'page'
  | 'album'
  | 'artist'
  | 'mood'
  | 'song'

export function toMusicNavView(view: string): MusicNavView {
  switch (view) {
    case 'page':
    case 'song':
    case 'album':
    case 'artist':
    case 'mood':
      return view
    default:
      return 'page'
  }
}

export type MusicNavFrame = {
  view: MusicNavView
  activePage: string
  activeNavKey: string
  musicSection?: string
  discoverQuery?: string
  selectedAlbumId: string | null
  selectedArtistId: string | null
  selectedMoodTitle: string | null
  scrollY: number
}

function frameSignature(frame: MusicNavFrame): string {
  return [
    frame.view,
    frame.activePage,
    frame.activeNavKey,
    frame.musicSection ?? '',
    frame.discoverQuery ?? '',
    frame.selectedAlbumId ?? '',
    frame.selectedArtistId ?? '',
    frame.selectedMoodTitle ?? '',
  ].join('|')
}

export function createMusicNavigationStack() {
  const stack: MusicNavFrame[] = []

  return {
    push(frame: MusicNavFrame) {
      const signature = frameSignature(frame)
      const top = stack[stack.length - 1]
      if (top && frameSignature(top) === signature) return
      stack.push(frame)
    },
    pop(): MusicNavFrame | undefined {
      return stack.pop()
    },
    peek(): MusicNavFrame | undefined {
      return stack[stack.length - 1]
    },
    clear() {
      stack.length = 0
    },
    size() {
      return stack.length
    },
  }
}

export type MusicNavigationStack = ReturnType<typeof createMusicNavigationStack>
