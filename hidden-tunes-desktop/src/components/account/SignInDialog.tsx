import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useDesktopAuth } from '../../context/useDesktopAuth'

type AuthMode = 'sign-in' | 'sign-up' | 'reset'

type SignInDialogProps = {
  open: boolean
  onClose: () => void
  onSignedIn?: () => void
  initialMode?: AuthMode
}

/**
 * Desktop account dialog — does not remount playback or clear Queue.
 */
export function SignInDialog({
  open,
  onClose,
  onSignedIn,
  initialMode = 'sign-in',
}: SignInDialogProps) {
  const { configured, signIn, signUp, requestPasswordReset } = useDesktopAuth()
  const titleId = useId()
  const emailRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [openSnapshot, setOpenSnapshot] = useState(open)

  if (open !== openSnapshot) {
    setOpenSnapshot(open)
    if (open) {
      setMode(initialMode)
      setError(null)
      setInfo(null)
      setBusy(false)
      setPassword('')
      setConfirm('')
    }
  }

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => emailRef.current?.focus(), 0)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [busy, onClose, open])

  if (!open) return null

  const title =
    mode === 'sign-up' ? 'Create account' : mode === 'reset' ? 'Reset password' : 'Sign in'

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError(null)
    setInfo(null)

    if (!configured) {
      setError('Account services are not configured in this desktop build.')
      return
    }

    setBusy(true)
    try {
      if (mode === 'reset') {
        const result = await requestPasswordReset(email)
        if (result.error) {
          setError(result.error)
          return
        }
        setInfo('If an account exists for that email, a reset message has been sent.')
        return
      }

      if (mode === 'sign-up') {
        if (password !== confirm) {
          setError('Passwords do not match.')
          return
        }
        const result = await signUp(email, password)
        if (result.error) {
          setError(result.error)
          return
        }
        if (result.needsEmailConfirmation) {
          setInfo('Check your email to confirm the account, then sign in.')
          setMode('sign-in')
          setPassword('')
          setConfirm('')
          return
        }
        onSignedIn?.()
        onClose()
        return
      }

      const result = await signIn(email, password)
      if (result.error) {
        setError(result.error)
        return
      }
      onSignedIn?.()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="account-gate-root" role="presentation">
      <button
        type="button"
        className="account-gate-backdrop"
        aria-label="Dismiss"
        disabled={busy}
        onClick={() => {
          if (!busy) onClose()
        }}
      />
      <div
        className="account-gate-dialog account-auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId}>{title}</h2>
        <p>
          {mode === 'reset'
            ? 'We will email reset instructions when the address matches an account.'
            : 'Use your Hidden Tunes account. Playback continues while this dialog is open.'}
        </p>
        <form className="account-auth-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="account-auth-field">
            <span>Email</span>
            <input
              ref={emailRef}
              type="email"
              name="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={busy}
            />
          </label>
          {mode !== 'reset' ? (
            <label className="account-auth-field">
              <span>Password</span>
              <div className="account-auth-password-row">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={6}
                  disabled={busy}
                />
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-pressed={showPassword}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
          ) : null}
          {mode === 'sign-up' ? (
            <label className="account-auth-field">
              <span>Confirm password</span>
              <input
                type={showPassword ? 'text' : 'password'}
                name="confirm-password"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                required
                minLength={6}
                disabled={busy}
              />
            </label>
          ) : null}
          {error ? (
            <p className="account-auth-error" role="alert">
              {error}
            </p>
          ) : null}
          {info ? (
            <p className="account-auth-info" role="status">
              {info}
            </p>
          ) : null}
          <div className="account-gate-actions">
            <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary btn-sm" disabled={busy}>
              {busy
                ? 'Please wait…'
                : mode === 'reset'
                  ? 'Send reset email'
                  : mode === 'sign-up'
                    ? 'Create account'
                    : 'Sign in'}
            </button>
          </div>
        </form>
        <div className="account-auth-switch">
          {mode === 'sign-in' ? (
            <>
              <button type="button" disabled={busy} onClick={() => setMode('sign-up')}>
                Create an account
              </button>
              <button type="button" disabled={busy} onClick={() => setMode('reset')}>
                Forgot password?
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setMode('sign-in')
                setError(null)
                setInfo(null)
              }}
            >
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
