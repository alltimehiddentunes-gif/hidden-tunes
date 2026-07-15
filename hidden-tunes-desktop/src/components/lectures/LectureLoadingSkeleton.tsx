export function LectureLoadingSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="lectures-program-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <article key={index} className="lectures-program-card lectures-program-card--skeleton">
          <div className="lectures-skeleton-art" />
          <div className="lectures-skeleton-line lectures-skeleton-line--title" />
          <div className="lectures-skeleton-line" />
        </article>
      ))}
    </div>
  )
}
