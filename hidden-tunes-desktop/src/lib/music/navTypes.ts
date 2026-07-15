export type GlobalNavKey =
  | 'home'
  | 'music'
  | 'radio'
  | 'podcasts'
  | 'audiobooks'
  | 'tv'
  | 'motivationals'
  | 'lectures'

/**
 * Canonical primary-section order for GlobalTopNav and Sidebar Primary group.
 * Keep both surfaces in sync with this list.
 */
export const PRIMARY_SECTION_NAV: ReadonlyArray<{
  navKey: GlobalNavKey
  label: string
}> = [
  { navKey: 'home', label: 'Home' },
  { navKey: 'music', label: 'Music' },
  { navKey: 'radio', label: 'Radio' },
  { navKey: 'podcasts', label: 'Podcasts' },
  { navKey: 'tv', label: 'TV' },
  { navKey: 'audiobooks', label: 'Audiobooks' },
  { navKey: 'motivationals', label: 'Motivationals' },
  { navKey: 'lectures', label: 'Lectures' },
] as const
