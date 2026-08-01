import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { SignInDialog } from '../components/account/SignInDialog'
import {
  getDesktopSupabaseSessionSummary,
  isDesktopAuthConfigured,
  requestDesktopPasswordReset,
  signInDesktopWithPassword,
  signOutDesktopSession,
  signUpDesktopWithPassword,
  subscribeDesktopAuth,
  type DesktopSupabaseSessionSummary,
} from '../services/desktopSupabaseAuth'
import { DesktopAuthContext } from './desktopAuthContext'

const EMPTY_SESSION: DesktopSupabaseSessionSummary = {
  isConfigured: false,
  isSignedIn: false,
  email: null,
  userId: null,
  error: null,
}

export function DesktopAuthProvider({ children }: { children: ReactNode }) {
  const configured = isDesktopAuthConfigured()
  const [session, setSession] = useState<DesktopSupabaseSessionSummary>({
    ...EMPTY_SESSION,
    isConfigured: configured,
  })
  const [refreshing, setRefreshing] = useState(false)
  const [signInOpen, setSignInOpen] = useState(false)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const next = await getDesktopSupabaseSessionSummary()
      setSession(next)
      return next
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const unsub = subscribeDesktopAuth(() => {
      startTransition(() => {
        void refresh()
      })
    })
    const timer = window.setTimeout(() => {
      startTransition(() => {
        void refresh()
      })
    }, 0)
    return () => {
      window.clearTimeout(timer)
      unsub()
    }
  }, [refresh])

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await signInDesktopWithPassword(email, password)
      await refresh()
      return { error: result.error }
    },
    [refresh],
  )

  const signUp = useCallback(
    async (email: string, password: string) => {
      const result = await signUpDesktopWithPassword(email, password)
      await refresh()
      return { error: result.error, needsEmailConfirmation: result.needsEmailConfirmation }
    },
    [refresh],
  )

  const requestPasswordReset = useCallback(async (email: string) => {
    return requestDesktopPasswordReset(email)
  }, [])

  const signOut = useCallback(async () => {
    const result = await signOutDesktopSession()
    await refresh()
    return { error: result.error }
  }, [refresh])

  const openSignIn = useCallback(() => setSignInOpen(true), [])
  const closeSignIn = useCallback(() => setSignInOpen(false), [])

  const value = useMemo(
    () => ({
      configured,
      session,
      refreshing,
      signInOpen,
      openSignIn,
      closeSignIn,
      refresh,
      signIn,
      signUp,
      requestPasswordReset,
      signOut,
    }),
    [
      closeSignIn,
      configured,
      openSignIn,
      refresh,
      refreshing,
      requestPasswordReset,
      session,
      signIn,
      signInOpen,
      signOut,
      signUp,
    ],
  )

  return (
    <DesktopAuthContext.Provider value={value}>
      {children}
      <SignInDialog open={signInOpen} onClose={closeSignIn} />
    </DesktopAuthContext.Provider>
  )
}
