const fromPublicBrandDirectory = (filename: string) =>
  `${import.meta.env.BASE_URL}brand/${filename}`

export const HIDDEN_TUNES_BRAND = {
  officialSource: fromPublicBrandDirectory('hidden-tunes-official.png'),
  mark: fromPublicBrandDirectory('hidden-tunes-mark.png'),
} as const
