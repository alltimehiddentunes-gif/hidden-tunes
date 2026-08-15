export type TvCapabilities = {
  nativeHls: boolean
  mediaSource: boolean
  lowMemory: boolean
  platform: 'vidaa' | 'tizen' | 'webos' | 'browser'
}

export function detectTvCapabilities(userAgent = navigator.userAgent): TvCapabilities {
  const value = userAgent.toLowerCase()
  const platform = value.includes('vidaa') || value.includes('hisense') ? 'vidaa'
    : value.includes('tizen') ? 'tizen'
      : value.includes('web0s') || value.includes('webos') ? 'webos' : 'browser'
  const video = document.createElement('video')
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  return {
    nativeHls: Boolean(video.canPlayType('application/vnd.apple.mpegurl')),
    mediaSource: typeof MediaSource !== 'undefined',
    lowMemory: new URLSearchParams(location.search).get('lowMemory') === '1'
      || platform === 'vidaa'
      || (typeof deviceMemory === 'number' && deviceMemory <= 2),
    platform,
  }
}
