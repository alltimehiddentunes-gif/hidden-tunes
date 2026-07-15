import { memo, useCallback, useMemo, useState, type ComponentType } from 'react'
import { useDesktopPlayback } from '../../context/DesktopPlaybackProvider'
import {
  formatAudiobookBookSubtitle,
  formatAudiobookChapterMetaLine,
  formatAudiobookDuration,
} from '../../lib/audiobooks/audiobookFormatters'
import { parseAudiobookSongId } from '../../lib/audiobooks/audiobookPlaybackAdapter'
import {
  getAudiobookChapterProgress,
  getAudiobookProgress,
  isAudiobookChapterCompleted,
} from '../../lib/audiobooks/audiobookProgressStorage'
import type { AudiobookChapterMeta, PlayAudiobookChapterHandler } from '../../lib/audiobooks/types'
import { useAudiobookBookData } from '../../lib/audiobooks/useAudiobookBookData'

type ArtworkImageProps = {
  src: string | null
  alt: string
  seed: string
  label: string
  variant?: 'square' | 'wide'
  priority?: boolean
}

type AudiobookBookPageProps = {
  bookId: string
  onBack: () => void
  onPlayAudiobookChapter: PlayAudiobookChapterHandler
  ArtworkImage: ComponentType<ArtworkImageProps>
}

function ChapterRow({
  chapter,
  bookCoverUrl,
  onPlay,
  tuning,
  isActive,
  isCompleted,
  progressPercent,
  ArtworkImage,
}: {
  chapter: AudiobookChapterMeta
  bookCoverUrl: string | null
  onPlay: () => void
  tuning: boolean
  isActive: boolean
  isCompleted: boolean
  progressPercent: number
  ArtworkImage: ComponentType<ArtworkImageProps>
}) {
  return (
    <article className={`audiobook-chapter-row${isActive ? ' is-active' : ''}${isCompleted ? ' is-completed' : ''}`}>
      <div className="audiobook-chapter-row-art">
        <ArtworkImage src={bookCoverUrl} alt="" seed={chapter.id} label={chapter.title} />
      </div>
      <div className="audiobook-chapter-row-copy">
        <h3>
          {chapter.chapterNumber != null ? `Chapter ${chapter.chapterNumber}` : 'Chapter'}
          {isActive ? <span className="audiobook-chapter-badge">Now playing</span> : null}
          {isCompleted ? <span className="audiobook-chapter-badge">Completed</span> : null}
        </h3>
        <p>{chapter.title}</p>
        <span>{formatAudiobookChapterMetaLine(chapter)}</span>
        {progressPercent > 0 && !isCompleted ? (
          <div className="audiobook-chapter-progress" aria-hidden="true">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="audiobook-chapter-row-play"
        disabled={tuning}
        onClick={onPlay}
        aria-label={`Play ${chapter.title}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      </button>
    </article>
  )
}

export const AudiobookBookPage = memo(function AudiobookBookPage({
  bookId,
  onBack,
  onPlayAudiobookChapter,
  ArtworkImage,
}: AudiobookBookPageProps) {
  const [tuningChapterId, setTuningChapterId] = useState<string | null>(null)
  const { currentTrack } = useDesktopPlayback()
  const { book, chapters, loading, error } = useAudiobookBookData(bookId)

  const bookProgress = useMemo(
    () => (book ? getAudiobookProgress(book.id) : null),
    [book],
  )

  const activeIds = useMemo(() => parseAudiobookSongId(currentTrack?.id ?? ''), [currentTrack?.id])

  const playChapter = useCallback(
    (chapter: AudiobookChapterMeta, resumePositionSeconds?: number | null) => {
      if (!book) return
      const startIndex = Math.max(0, chapters.findIndex((entry) => entry.id === chapter.id))
      const queue = chapters.slice(startIndex)
      setTuningChapterId(chapter.id)
      onPlayAudiobookChapter(book, chapter, queue, 0, book.title, {
        resumePositionSeconds,
      })
      window.setTimeout(() => setTuningChapterId(null), 800)
    },
    [book, chapters, onPlayAudiobookChapter],
  )

  const resumeChapter = useCallback(() => {
    if (!book || !bookProgress) return
    const chapter = chapters.find((entry) => entry.id === bookProgress.chapterId) ?? chapters[0]
    if (!chapter) return
    playChapter(chapter, bookProgress.positionSeconds)
  }, [book, bookProgress, chapters, playChapter])

  const playFromBeginning = useCallback(() => {
    const first = chapters[0]
    if (!book || !first) return
    playChapter(first, 0)
  }, [book, chapters, playChapter])

  if (loading) {
    return (
      <div className="audiobook-book-page">
        <button type="button" className="btn-ghost btn-sm" onClick={onBack}>Back</button>
        <p className="audiobooks-status">Loading book…</p>
      </div>
    )
  }

  if (error || !book) {
    return (
      <div className="audiobook-book-page">
        <button type="button" className="btn-ghost btn-sm" onClick={onBack}>Back</button>
        <p className="audiobooks-status audiobooks-status--error" role="alert">{error ?? 'Book not found.'}</p>
      </div>
    )
  }

  return (
    <div className="audiobook-book-page">
      <button type="button" className="btn-ghost btn-sm audiobook-book-back" onClick={onBack}>
        Back to Audiobooks
      </button>

      <header className="audiobook-book-hero">
        <div className="audiobook-book-cover">
          <ArtworkImage
            src={book.coverUrl}
            alt=""
            seed={book.id}
            label={book.title}
            variant="square"
            priority
          />
        </div>
        <div className="audiobook-book-hero-copy">
          <h1>{book.title}</h1>
          <p className="audiobook-book-subtitle">{formatAudiobookBookSubtitle(book)}</p>
          {book.description ? <p className="audiobook-book-description">{book.description}</p> : null}
          <div className="audiobook-book-meta">
            {book.language ? <span>{book.language}</span> : null}
            {book.publisher ? <span>{book.publisher}</span> : null}
            {book.durationSeconds ? <span>{formatAudiobookDuration(book.durationSeconds)}</span> : null}
            {book.chapterCount > 0 ? <span>{book.chapterCount} chapters</span> : null}
          </div>
          <div className="audiobook-book-actions">
            <button type="button" className="btn-primary btn-sm" onClick={playFromBeginning}>
              Play from Beginning
            </button>
            {bookProgress ? (
              <button type="button" className="btn-secondary btn-sm" onClick={resumeChapter}>
                Resume
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <section className="audiobook-chapter-list-section" aria-labelledby="audiobook-chapters-heading">
        <h2 id="audiobook-chapters-heading">Chapters</h2>
        {chapters.length === 0 ? (
          <p className="audiobooks-status audiobooks-status--empty">This book has no chapters yet.</p>
        ) : (
          <div className="audiobook-chapter-list">
            {chapters.map((chapter) => {
              const chapterProgress = getAudiobookChapterProgress(book.id, chapter.id)
              const isActive =
                activeIds?.bookId === book.id && activeIds.chapterId === chapter.id
              const isCompleted = chapterProgress
                ? isAudiobookChapterCompleted(
                    chapterProgress.positionSeconds,
                    chapterProgress.durationSeconds,
                  ) || chapterProgress.completed
                : false
              const progressPercent =
                chapterProgress?.durationSeconds && chapterProgress.durationSeconds > 0
                  ? Math.min(
                      100,
                      Math.round(
                        (chapterProgress.positionSeconds / chapterProgress.durationSeconds) * 100,
                      ),
                    )
                  : 0

              return (
                <ChapterRow
                  key={chapter.id}
                  chapter={chapter}
                  bookCoverUrl={book.coverUrl}
                  onPlay={() => playChapter(chapter)}
                  tuning={tuningChapterId === chapter.id}
                  isActive={isActive}
                  isCompleted={isCompleted}
                  progressPercent={progressPercent}
                  ArtworkImage={ArtworkImage}
                />
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
})
