import { createContext } from 'react'
import type { DesktopSupabaseSessionSummary } from '../services/desktopSupabaseAuth'

export type DesktopAuthContextValue = {
  configured: boolean
  session: DesktopSupabaseSessionSummary
  refreshing: boolean
  signInOpen: boolean
  sessionNotice: string | null
  clearSessionNotice: () => void
  openSignIn: () => void
  closeSignIn: () => void
  refresh: () => Promise<DesktopSupabaseSessionSummary>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  requestMagicLink: (email: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string) => Promise<{
    error: string | null
    needsEmailConfirmation: boolean
  }>
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>
  updatePassword: (password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<{ error: string | null }>
}

export const DesktopAuthContext = createContext<DesktopAuthContextValue | null>(null)
