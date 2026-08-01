/**
 * Centralized product honesty gate for account-dependent actions.
 * Does not implement authentication — only consistent messaging before auth ships.
 */

export type AccountRequiredAction =
  | 'follow'
  | 'sync'
  | 'premium'
  | 'cross_device'
  | 'account_settings'

export type AccountGateState = {
  /** True only when a real signed-in session exists. */
  isSignedIn: boolean
  /** True when a usable sign-in UI exists on desktop (Phase 9: false). */
  signInUiAvailable: boolean
}

export const ACCOUNT_GATE_COPY: Record<
  AccountRequiredAction,
  { title: string; body: string }
> = {
  follow: {
    title: 'Sign-in required to follow',
    body:
      'Following artists syncs with your Hidden Tunes account. Sign-in is not available in this desktop preview yet, so Follow cannot be completed.',
  },
  sync: {
    title: 'Sign-in required for sync',
    body:
      'Cross-device library sync needs a signed-in account. Sign-in is not available in this desktop preview yet.',
  },
  premium: {
    title: 'Membership unavailable',
    body:
      'Premium purchasing and entitlements are not connected in this desktop build.',
  },
  cross_device: {
    title: 'Account required',
    body:
      'Cross-device features need a signed-in Hidden Tunes account. Sign-in is not available in this desktop preview yet.',
  },
  account_settings: {
    title: 'Account settings unavailable',
    body:
      'This install uses a local profile only. Account management and sign-in are not available in this desktop preview yet.',
  },
}

export function resolveAccountGate(
  action: AccountRequiredAction,
  state: AccountGateState,
): { allowed: boolean; title: string; body: string } {
  const copy = ACCOUNT_GATE_COPY[action]
  if (state.isSignedIn) {
    return { allowed: true, title: copy.title, body: copy.body }
  }
  return { allowed: false, title: copy.title, body: copy.body }
}
