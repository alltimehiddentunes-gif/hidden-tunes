import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  const [sessionNotice, setSessionNotice] = useState<string | null>(null)
  const knownSignedInRef = useRef(false)
  const intentionalSignOutRef = useRef(false)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const next = await getDesktopSupabaseSessionSummary()
      setSession((previous) => {
        if (
          knownSignedInRef.current &&
          previous.isSignedIn &&
          !next.isSignedIn &&
          !intentionalSignOutRef.current
        ) {
          setSessionNotice(
            'Your account session ended. Sign in again to use Follow and account features.',
          )
        }
        if (next.isSignedIn) {
          setSessionNotice(null)
          intentionalSignOutRef.current = false
        }
        knownSignedInRef.current = next.isSignedIn
        return next
      })
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
      intentionalSignOutRef.current = false
      const result = await signInDesktopWithPassword(email, password)
      await refresh()
      return { error: result.error }
    },
    [refresh],
  )

  const signUp = useCallback(
    async (email: string, password: string) => {
      intentionalSignOutRef.current = false
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
    intentionalSignOutRef.current = true
    const result = await signOutDesktopSession()
    await refresh()
    return { error: result.error }
  }, [refresh])

  const openSignIn = useCallback(() => setSignInOpen(true), [])
  const closeSignIn = useCallback(() => setSignInOpen(false), [])
  const clearSessionNotice = useCallback(() => setSessionNotice(null), [])

  const value = useMemo(
    () => ({
      configured,
      session,
      refreshing,
      signInOpen,
      sessionNotice,
      clearSessionNotice,
      openSignIn,
      closeSignIn,
      refresh,
      signIn,
      signUp,
      requestPasswordReset,
      signOut,
    }),
    [
      clearSessionNotice,
      closeSignIn,
      configured,
      openSignIn,
      refresh,
      refreshing,
      requestPasswordReset,
      session,
      sessionNotice,
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
