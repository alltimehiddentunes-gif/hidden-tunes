import { useEffect, useId, useRef } from 'react'

type AccountRequiredDialogProps = {
  open: boolean
  title: string
  body: string
  onClose: () => void
  /** When set, shows a Sign in action that does not stop playback. */
  onSignIn?: () => void
}

/**
 * Lightweight sign-in-required / account-gated notice.
 * Does not stop playback or remount the page.
 */
export function AccountRequiredDialog({
  open,
  title,
  body,
  onClose,
  onSignIn,
}: AccountRequiredDialogProps) {
  const titleId = useId()
  const primaryRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    primaryRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="account-gate-root" role="presentation">
      <button
        type="button"
        className="account-gate-backdrop"
        aria-label="Dismiss"
        onClick={onClose}
      />
      <div
        className="account-gate-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId}>{title}</h2>
        <p>{body}</p>
        <div className="account-gate-actions">
          {onSignIn ? (
            <>
              <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
                Not now
              </button>
              <button
                ref={primaryRef}
                type="button"
                className="btn-primary btn-sm"
                onClick={onSignIn}
              >
                Sign in
              </button>
            </>
          ) : (
            <button
              ref={primaryRef}
              type="button"
              className="btn-primary btn-sm"
              onClick={onClose}
            >
              Got it
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
