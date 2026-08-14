import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { SignInDialog, type AuthMode } from '../components/account/SignInDialog'
import {
  getDesktopSupabaseSessionSummary,
  isDesktopAuthConfigured,
  requestDesktopMagicLink,
  requestDesktopPasswordReset,
  signInDesktopWithPassword,
  signOutDesktopSession,
  signUpDesktopWithPassword,
  subscribeDesktopAuth,
  updateDesktopPassword,
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
  const browserPasswordRecovery = typeof window !== 'undefined'
    && window.location.pathname === '/reset-password'
  const [signInOpen, setSignInOpen] = useState(browserPasswordRecovery)
  const [authMode, setAuthMode] = useState<AuthMode>(browserPasswordRecovery ? 'update-password' : 'sign-in')
  const [sessionNotice, setSessionNotice] = useState<string | null>(null)
  const knownSignedInRef = useRef(false)
  const intentionalSignOutRef = useRef(false)
  const returnFocusRef = useRef<HTMLElement | null>(null)

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
    const unsub = subscribeDesktopAuth((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setAuthMode('update-password')
        setSignInOpen(true)
      }
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

  const requestMagicLink = useCallback(async (email: string) => {
    return requestDesktopMagicLink(email)
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    return updateDesktopPassword(password)
  }, [])

  const signOut = useCallback(async () => {
    intentionalSignOutRef.current = true
    const result = await signOutDesktopSession()
    await refresh()
    return { error: result.error }
  }, [refresh])

  const openSignIn = useCallback(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setAuthMode('sign-in')
    setSignInOpen(true)
  }, [])
  const closeSignIn = useCallback(() => {
    setSignInOpen(false)
    window.setTimeout(() => returnFocusRef.current?.focus(), 0)
  }, [])
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
      requestMagicLink,
      signUp,
      requestPasswordReset,
      updatePassword,
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
      requestMagicLink,
      session,
      sessionNotice,
      signIn,
      signInOpen,
      signOut,
      signUp,
      updatePassword,
    ],
  )

  return (
    <DesktopAuthContext.Provider value={value}>
      {children}
      <SignInDialog open={signInOpen} onClose={closeSignIn} initialMode={authMode} />
    </DesktopAuthContext.Provider>
  )
}
