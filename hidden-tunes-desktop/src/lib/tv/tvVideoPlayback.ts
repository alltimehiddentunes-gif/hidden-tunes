import { HtmlVideoPlaybackService } from './HtmlVideoPlaybackService'

let singleton: HtmlVideoPlaybackService | null = null

export type { HtmlVideoPlaybackService }

export function acquireTvVideoPlaybackService(): HtmlVideoPlaybackService {
  if (!singleton) {
    singleton = new HtmlVideoPlaybackService()
  }
  return singleton
}

export function releaseTvVideoPlaybackServiceForTests() {
  singleton?.destroy()
  singleton = null
}
