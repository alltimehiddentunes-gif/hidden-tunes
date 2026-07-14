export function buildSeededWaveformHeights(seed: string, count = 36): number[] {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }
  return Array.from({ length: count }, (_, index) => {
    const value = Math.sin((hash + index * 17) * 0.73) * 0.5 + 0.5
    const shaped = 0.28 + value * 0.72
    return Math.round(shaped * 100)
  })
}
