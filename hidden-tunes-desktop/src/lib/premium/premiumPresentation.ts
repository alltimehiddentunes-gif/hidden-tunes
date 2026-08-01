/**
 * Canonical Premium / membership presentation for desktop launch honesty.
 * No invented prices, entitlements, or purchase paths.
 */

/** Desktop has no backend entitlement authority for Premium membership. */
export const PREMIUM_MEMBERSHIP = {
  checkoutAvailable: false,
  entitlementAuthority: 'none' as const,
  /** Neutral account copy — never claim Premium without real authority. */
  accountStatusLabel: 'Local profile — no membership',
  membershipStatusLabel: 'Not available on this desktop preview',
  billingStatusLabel: 'Checkout and billing are not connected',
} as const

export type PremiumSurfaceAction = 'settings' | 'worlds' | 'downloads'

export type PremiumCapabilitySpec = {
  id: string
  title: string
  description: string
  /** Working today without a membership purchase. */
  status: 'included'
  action: PremiumSurfaceAction
  actionLabel: string
}

export type PremiumComingSoonSpec = {
  id: string
  title: string
  description: string
  status: 'coming-soon'
}

/**
 * Capabilities that already work on desktop and must not be sold as Premium-only.
 */
export const DESKTOP_INCLUDED_CAPABILITIES: readonly PremiumCapabilitySpec[] = [
  {
    id: 'hq-audio',
    title: 'Playback quality settings',
    description:
      'Choose auto, data saver, standard, or high-quality preferences for this install. Lossless plays only when a song provides a lossless source.',
    status: 'included',
    action: 'settings',
    actionLabel: 'Open settings',
  },
  {
    id: 'worlds',
    title: 'Emotional Worlds',
    description: 'Browse cinematic listening scenes curated from catalogue moods and genres.',
    status: 'included',
    action: 'worlds',
    actionLabel: 'Browse worlds',
  },
  {
    id: 'cinema',
    title: 'Player layouts',
    description:
      'Full-screen and alternate player layouts are available from Settings while something is playing.',
    status: 'included',
    action: 'settings',
    actionLabel: 'Open settings',
  },
  {
    id: 'offline',
    title: 'Downloads for offline listening',
    description:
      'Download eligible catalogue items through Downloads. Stream-only families such as Radio and TV stay online-only.',
    status: 'included',
    action: 'downloads',
    actionLabel: 'Open downloads',
  },
]

/**
 * Real membership / billing capabilities that are not available on desktop yet.
 */
export const MEMBERSHIP_COMING_SOON: readonly PremiumComingSoonSpec[] = [
  {
    id: 'billing',
    title: 'Membership checkout and billing',
    description:
      'Purchase, renew, or manage a Hidden Tunes membership from this desktop app. No plans or prices are offered until checkout exists.',
    status: 'coming-soon',
  },
  {
    id: 'account-sync',
    title: 'Cross-device account sync',
    description:
      'Signed-in membership state shared with mobile and web. This preview uses a local profile only.',
    status: 'coming-soon',
  },
  {
    id: 'exclusive-catalogue',
    title: 'Membership-gated catalogue',
    description:
      'Content that unlocks only after a verified membership entitlement from the backend.',
    status: 'coming-soon',
  },
]
