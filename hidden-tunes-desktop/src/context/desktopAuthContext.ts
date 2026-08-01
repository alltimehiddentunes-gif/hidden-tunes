import { createContext } from 'react'
import type { DesktopSupabaseSessionSummary } from '../services/desktopSupabaseAuth'

export type DesktopAuthContextValue = {
  configured: boolean
  session: DesktopSupabaseSessionSummary
  refreshing: boolean
  signInOpen: boolean
  openSignIn: () => void
  closeSignIn: () => void
  refresh: () => Promise<DesktopSupabaseSessionSummary>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string) => Promise<{
    error: string | null
    needsEmailConfirmation: boolean
  }>
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>
  signOut: () => Promise<{ error: string | null }>
}

export const DesktopAuthContext = createContext<DesktopAuthContextValue | null>(null)
