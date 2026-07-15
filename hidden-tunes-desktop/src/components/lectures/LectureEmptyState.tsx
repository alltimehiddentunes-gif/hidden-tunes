type LectureEmptyStateProps = {
  title?: string
  message?: string
}

export function LectureEmptyState({
  title = 'No lectures found',
  message = 'Try another subject, speaker, or search term.',
}: LectureEmptyStateProps) {
  return (
    <div className="lectures-empty-state" role="status">
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  )
}
