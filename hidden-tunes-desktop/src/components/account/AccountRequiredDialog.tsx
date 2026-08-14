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
  const dialogRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    primaryRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
        if (!focusable?.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.setTimeout(() => returnFocusRef.current?.focus(), 0)
    }
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
        ref={dialogRef}
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
