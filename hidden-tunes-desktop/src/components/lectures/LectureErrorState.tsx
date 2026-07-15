type LectureErrorStateProps = {
  message: string
  onRetry?: () => void
}

export function LectureErrorState({ message, onRetry }: LectureErrorStateProps) {
  return (
    <div className="lectures-error-state" role="alert">
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="lectures-btn lectures-btn--ghost" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  )
}
