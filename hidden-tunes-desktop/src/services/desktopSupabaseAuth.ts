/**
 * Minimal desktop Supabase auth — same Hidden Tunes user identity as mobile.
 * Uses public anon key only; never service-role.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL =
  (import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL?.trim() ||
  (import.meta as { env?: Record<string, string> }).env?.VITE_PUBLIC_SUPABASE_URL?.trim() ||
  ''
const SUPABASE_ANON_KEY =
  (import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_ANON_KEY?.trim() ||
  (import.meta as { env?: Record<string, string> }).env?.VITE_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  ''

let cachedClient: SupabaseClient | null = null

export type DesktopSupabaseSessionSummary = {
  isConfigured: boolean
  isSignedIn: boolean
  email: string | null
  userId: string | null
  error: string | null
}

function getDesktopSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null
  if (!cachedClient) {
    cachedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  }
  return cachedClient
}

export function isDesktopAuthConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}

export async function getDesktopSupabaseAccessToken() {
  const supabase = getDesktopSupabaseClient()
  if (!supabase) {
    return {
      accessToken: null as string | null,
      error: 'Sign in to follow artists.',
    }
  }

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()

  if (error) {
    return {
      accessToken: null as string | null,
      error: error.message || 'Could not read the current session.',
    }
  }

  if (!session?.access_token) {
    return {
      accessToken: null as string | null,
      error: 'Sign in to follow artists.',
    }
  }

  return {
    accessToken: session.access_token as string,
    error: null as string | null,
  }
}

export async function getDesktopSupabaseSessionSummary(): Promise<DesktopSupabaseSessionSummary> {
  const supabase = getDesktopSupabaseClient()
  if (!supabase) {
    return {
      isConfigured: false,
      isSignedIn: false,
      email: null,
      userId: null,
      error: 'Account sign-in is not configured in this desktop build.',
    }
  }

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()

  if (error) {
    return {
      isConfigured: true,
      isSignedIn: false,
      email: null,
      userId: null,
      error: error.message || 'Could not read the current session.',
    }
  }

  return {
    isConfigured: true,
    isSignedIn: Boolean(session?.access_token),
    email: session?.user?.email || null,
    userId: session?.user?.id || null,
    error: null,
  }
}

function mapAuthError(message: string | undefined, fallback: string) {
  const text = (message || '').trim()
  if (!text) return fallback
  if (/invalid login credentials/i.test(text)) return 'Email or password is incorrect.'
  if (/email not confirmed/i.test(text)) return 'Confirm your email before signing in.'
  if (/rate limit|too many/i.test(text)) return 'Too many attempts. Try again in a moment.'
  if (/user already registered/i.test(text)) {
    return 'An account with that email already exists. Sign in instead.'
  }
  if (/password/i.test(text) && /weak|least|characters/i.test(text)) {
    return 'Choose a stronger password (at least 6 characters).'
  }
  if (/network|fetch/i.test(text)) return 'Network error. Check your connection and try again.'
  return text.length > 160 ? fallback : text
}

export async function signInDesktopWithPassword(email: string, password: string) {
  const supabase = getDesktopSupabaseClient()
  if (!supabase) {
    return { email: null as string | null, error: 'Account sign-in is not configured in this desktop build.' }
  }
  const trimmed = email.trim()
  if (!trimmed || !password) {
    return { email: null, error: 'Enter your email and password.' }
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: trimmed,
    password,
  })

  if (error || !data.session?.access_token) {
    return {
      email: null,
      error: mapAuthError(error?.message, 'Could not sign in with those credentials.'),
    }
  }

  return {
    email: data.user?.email || trimmed,
    error: null as string | null,
  }
}

export async function signUpDesktopWithPassword(email: string, password: string) {
  const supabase = getDesktopSupabaseClient()
  if (!supabase) {
    return {
      email: null as string | null,
      needsEmailConfirmation: false,
      error: 'Account sign-up is not configured in this desktop build.',
    }
  }
  const trimmed = email.trim()
  if (!trimmed || !password) {
    return { email: null, needsEmailConfirmation: false, error: 'Enter an email and password.' }
  }
  if (password.length < 6) {
    return { email: null, needsEmailConfirmation: false, error: 'Password must be at least 6 characters.' }
  }

  const { data, error } = await supabase.auth.signUp({
    email: trimmed,
    password,
  })

  if (error) {
    return {
      email: null,
      needsEmailConfirmation: false,
      error: mapAuthError(error.message, 'Could not create an account.'),
    }
  }

  const signedIn = Boolean(data.session?.access_token)
  return {
    email: data.user?.email || trimmed,
    needsEmailConfirmation: !signedIn,
    error: null as string | null,
  }
}

export async function requestDesktopPasswordReset(email: string) {
  const supabase = getDesktopSupabaseClient()
  if (!supabase) {
    return { error: 'Password reset is not configured in this desktop build.' }
  }
  const trimmed = email.trim()
  if (!trimmed) {
    return { error: 'Enter the email for your account.' }
  }

  const { error } = await supabase.auth.resetPasswordForEmail(trimmed)
  if (error && /rate limit|too many/i.test(error.message)) {
    return { error: mapAuthError(error.message, 'Too many attempts. Try again later.') }
  }
  return { error: null as string | null }
}

export async function signOutDesktopSession() {
  const supabase = getDesktopSupabaseClient()
  if (!supabase) {
    return { error: null as string | null }
  }
  const { error } = await supabase.auth.signOut()
  return { error: error ? mapAuthError(error.message, 'Could not sign out.') : null }
}

export function subscribeDesktopAuth(onChange: () => void) {
  const supabase = getDesktopSupabaseClient()
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange(() => {
    onChange()
  })
  return () => {
    data.subscription.unsubscribe()
  }
}
