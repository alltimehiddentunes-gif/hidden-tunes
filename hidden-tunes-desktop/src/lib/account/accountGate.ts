/**
 * Centralized product honesty gate for account-dependent actions.
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
  /** True when a usable sign-in UI exists on desktop. */
  signInUiAvailable: boolean
}

export const ACCOUNT_GATE_COPY: Record<
  AccountRequiredAction,
  { title: string; body: string; bodyWhenSignInAvailable: string }
> = {
  follow: {
    title: 'Sign-in required to follow',
    body:
      'Following artists syncs with your Hidden Tunes account. Sign-in is not configured in this desktop build, so Follow cannot be completed.',
    bodyWhenSignInAvailable:
      'Following artists syncs with your Hidden Tunes account. Sign in to continue — playback will keep running.',
  },
  sync: {
    title: 'Sign-in required for sync',
    body:
      'Cross-device library sync needs a signed-in account. Sign-in is not configured in this desktop build.',
    bodyWhenSignInAvailable: 'Cross-device library sync needs a signed-in Hidden Tunes account.',
  },
  premium: {
    title: 'Membership unavailable',
    body:
      'Premium purchasing and entitlements are not connected in this desktop build.',
    bodyWhenSignInAvailable:
      'Premium purchasing and entitlements are not connected in this desktop build.',
  },
  cross_device: {
    title: 'Account required',
    body:
      'Cross-device features need a signed-in Hidden Tunes account. Sign-in is not configured in this desktop build.',
    bodyWhenSignInAvailable: 'Cross-device features need a signed-in Hidden Tunes account.',
  },
  account_settings: {
    title: 'Account settings',
    body:
      'This install uses a local profile only. Account sign-in is not configured in this desktop build.',
    bodyWhenSignInAvailable: 'Sign in to manage your Hidden Tunes account on this desktop.',
  },
}

export function resolveAccountGate(
  action: AccountRequiredAction,
  state: AccountGateState,
): { allowed: boolean; title: string; body: string; showSignIn: boolean } {
  const copy = ACCOUNT_GATE_COPY[action]
  if (state.isSignedIn) {
    return { allowed: true, title: copy.title, body: copy.body, showSignIn: false }
  }
  return {
    allowed: false,
    title: copy.title,
    body: state.signInUiAvailable ? copy.bodyWhenSignInAvailable : copy.body,
    showSignIn: state.signInUiAvailable && action !== 'premium',
  }
}
