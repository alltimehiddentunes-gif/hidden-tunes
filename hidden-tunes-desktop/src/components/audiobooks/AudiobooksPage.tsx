import { memo, useCallback, useState, type ComponentType } from 'react'
import {
  formatAudiobookBookSubtitle,
  formatAudiobookDuration,
} from '../../lib/audiobooks/audiobookFormatters'
import { getAudiobookProgress } from '../../lib/audiobooks/audiobookProgressStorage'
import type {
  AudiobookBookMeta,
  AudiobookChapterMeta,
  PlayAudiobookChapterHandler,
} from '../../lib/audiobooks/types'
import { useAudiobookLocalState } from '../../lib/audiobooks/useAudiobookLocalState'
import { useAudiobooksPageData } from '../../lib/audiobooks/useAudiobooksPageData'

type ArtworkImageProps = {
  src: string | null
  alt: string
  seed: string
  label: string
  priority?: boolean
}

type AudiobooksPageProps = {
  query: string
  onOpenBook: (bookId: string) => void
  onPlayAudiobookChapter: PlayAudiobookChapterHandler
  ArtworkImage: ComponentType<ArtworkImageProps>
}

function BookCard({
  book,
  onOpen,
  onPlay,
  tuning,
  progressPercent,
  ArtworkImage,
}: {
  book: AudiobookBookMeta
  onOpen: (bookId: string) => void
  onPlay: () => void
  tuning: boolean
  progressPercent: number
  ArtworkImage: ComponentType<ArtworkImageProps>
}) {
  return (
    <article className="audiobook-book-card">
      <div
        role="button"
        tabIndex={0}
        className="audiobook-book-card-hit"
        onClick={() => onOpen(book.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpen(book.id)
          }
        }}
      >
        <div className="audiobook-book-card-art">
          <ArtworkImage src={book.coverUrl} alt="" seed={book.id} label={book.title} />
          {progressPercent > 0 ? (
            <span className="audiobook-progress-pill">{progressPercent}%</span>
          ) : null}
          <button
            type="button"
            className="audiobook-book-card-play"
            disabled={tuning}
            aria-label={`Play ${book.title}`}
            onClick={(event) => {
              event.stopPropagation()
              onPlay()
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        </div>
        <div className="audiobook-book-card-copy">
          <h3>{book.title}</h3>
          <p>{formatAudiobookBookSubtitle(book)}</p>
        </div>
      </div>
    </article>
  )
}

export const AudiobooksPage = memo(function AudiobooksPage({
  query,
  onOpenBook,
  onPlayAudiobookChapter,
  ArtworkImage,
}: AudiobooksPageProps) {
  const [categorySlug, setCategorySlug] = useState<string | null>(null)
  const [tuningBookId, setTuningBookId] = useState<string | null>(null)
  const { continueListening, recentlyPlayed } = useAudiobookLocalState()

  const {
    categories,
    featuredBooks,
    visibleBooks,
    newBooks,
    popularBooks,
    heroBook,
    pagination,
    loading,
    contentLoading,
    loadingMore,
    error,
    contentError,
    filteredView,
    loadMore,
  } = useAudiobooksPageData(query, categorySlug)

  const resumeBook = useCallback(
    (bookId: string) => {
      const progress = getAudiobookProgress(bookId)
      if (!progress) return
      const book: AudiobookBookMeta = {
        id: progress.bookId,
        slug: progress.bookId,
        title: progress.bookTitle,
        subtitle: null,
        description: null,
        coverUrl: progress.artworkUrl,
        authorName: progress.authorName,
        narratorName: progress.narratorName,
        seriesTitle: null,
        seriesPosition: null,
        categorySlug: null,
        categories: [],
        language: null,
        publisher: null,
        durationSeconds: progress.durationSeconds,
        chapterCount: progress.chapterCount ?? 0,
        isFeatured: false,
        isVerified: false,
        publishedAt: null,
        createdAt: null,
      }
      const chapter: AudiobookChapterMeta = {
        id: progress.chapterId,
        bookId: progress.bookId,
        title: progress.chapterTitle,
        description: null,
        chapterNumber: progress.chapterNumber,
        durationSeconds: progress.durationSeconds,
        publishedAt: null,
        createdAt: null,
      }
      setTuningBookId(book.id)
      onPlayAudiobookChapter(book, chapter, [chapter], 0, book.title, {
        resumePositionSeconds: progress.positionSeconds,
      })
      window.setTimeout(() => setTuningBookId(null), 800)
    },
    [onPlayAudiobookChapter],
  )

  return (
    <div className="audiobooks-destination">
      <section className="audiobooks-hero" aria-labelledby="audiobooks-page-heading">
        <div className="audiobooks-hero-backdrop" aria-hidden="true" />
        <div className="audiobooks-hero-copy">
          <h1 id="audiobooks-page-heading">Audiobooks</h1>
          <p>Long-form listening for focus, travel, and quiet hours.</p>
        </div>
        {heroBook ? (
          <div className="audiobooks-hero-feature">
            <ArtworkImage
              src={heroBook.coverUrl}
              alt=""
              seed={heroBook.id}
              label={heroBook.title}
              priority
            />
            <div className="audiobooks-hero-feature-copy">
              <span className="audiobooks-hero-eyebrow">
                {heroBook.categorySlug ?? heroBook.categories[0] ?? 'Featured'}
              </span>
              <h2>{heroBook.title}</h2>
              <p>{heroBook.authorName ?? 'Unknown author'}</p>
              {heroBook.description ? <p className="audiobooks-hero-description">{heroBook.description.slice(0, 180)}</p> : null}
              <div className="audiobooks-hero-actions">
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={() => onOpenBook(heroBook.id)}
                >
                  View Book
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {categories.length > 0 ? (
        <div className="audiobooks-tabs" role="tablist" aria-label="Audiobook categories">
          <button
            type="button"
            role="tab"
            aria-selected={categorySlug === null}
            className={`audiobooks-tab${categorySlug === null ? ' is-active' : ''}`}
            onClick={() => setCategorySlug(null)}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              role="tab"
              aria-selected={categorySlug === category.slug}
              className={`audiobooks-tab${categorySlug === category.slug ? ' is-active' : ''}`}
              onClick={() => setCategorySlug(category.slug)}
            >
              {category.title}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <section className="audiobooks-status audiobooks-status--error" role="alert">
          <p>{error}</p>
        </section>
      ) : loading ? (
        <section className="audiobooks-status" aria-busy="true">
          <p>Loading audiobook catalog…</p>
        </section>
      ) : null}

      {!loading && !error ? (
        <>
          {continueListening.length > 0 ? (
            <section className="audiobooks-section" aria-labelledby="audiobooks-continue-heading">
              <h2 id="audiobooks-continue-heading">Continue Listening</h2>
              <div className="audiobooks-continue-rail">
                {continueListening.map((entry) => (
                  <article key={entry.bookId} className="audiobooks-continue-card">
                    <ArtworkImage
                      src={entry.artworkUrl}
                      alt=""
                      seed={entry.bookId}
                      label={entry.bookTitle}
                    />
                    <div>
                      <h3>{entry.bookTitle}</h3>
                      <p>{entry.chapterTitle}</p>
                      <p>{formatAudiobookDuration(entry.durationSeconds)}</p>
                    </div>
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      onClick={() => resumeBook(entry.bookId)}
                    >
                      Resume
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {recentlyPlayed.length > 0 ? (
            <section className="audiobooks-section" aria-labelledby="audiobooks-recent-heading">
              <h2 id="audiobooks-recent-heading">Recently Played</h2>
              <div className="audiobooks-recent-list">
                {recentlyPlayed.map((entry) => (
                  <button
                    key={`${entry.bookId}:${entry.chapterId}`}
                    type="button"
                    className="audiobooks-recent-row"
                    onClick={() => onOpenBook(entry.bookId)}
                  >
                    <strong>{entry.bookTitle}</strong>
                    <span>{entry.chapterTitle}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {featuredBooks.length > 0 && !filteredView ? (
            <section className="audiobooks-section" aria-labelledby="audiobooks-featured-heading">
              <h2 id="audiobooks-featured-heading">Featured Books</h2>
              <div className="audiobooks-book-grid">
                {featuredBooks.map((book) => (
                  <BookCard
                    key={book.id}
                    book={book}
                    onOpen={onOpenBook}
                    onPlay={() => onOpenBook(book.id)}
                    tuning={tuningBookId === book.id}
                    progressPercent={0}
                    ArtworkImage={ArtworkImage}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {newBooks.length > 0 && !filteredView ? (
            <section className="audiobooks-section" aria-labelledby="audiobooks-new-heading">
              <h2 id="audiobooks-new-heading">Recently Added</h2>
              <div className="audiobooks-book-grid">
                {newBooks.map((book) => (
                  <BookCard
                    key={book.id}
                    book={book}
                    onOpen={onOpenBook}
                    onPlay={() => onOpenBook(book.id)}
                    tuning={tuningBookId === book.id}
                    progressPercent={0}
                    ArtworkImage={ArtworkImage}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {popularBooks.length > 0 && !filteredView ? (
            <section className="audiobooks-section" aria-labelledby="audiobooks-popular-heading">
              <h2 id="audiobooks-popular-heading">Popular Books</h2>
              <div className="audiobooks-book-grid">
                {popularBooks.map((book) => (
                  <BookCard
                    key={book.id}
                    book={book}
                    onOpen={onOpenBook}
                    onPlay={() => onOpenBook(book.id)}
                    tuning={tuningBookId === book.id}
                    progressPercent={0}
                    ArtworkImage={ArtworkImage}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section className="audiobooks-section" aria-labelledby="audiobooks-catalog-heading">
            <div className="audiobooks-section-header">
              <h2 id="audiobooks-catalog-heading">
                {filteredView ? 'Search Results' : 'Browse Audiobooks'}
              </h2>
              {contentLoading ? <span>Updating…</span> : null}
            </div>
            {contentError && visibleBooks.length === 0 ? (
              <div className="audiobooks-status audiobooks-status--error" role="alert">
                <p>{contentError}</p>
              </div>
            ) : visibleBooks.length === 0 ? (
              <div className="audiobooks-status audiobooks-status--empty" role="status">
                <p>{query.trim() ? `No books match “${query.trim()}”.` : 'No audiobooks in this view.'}</p>
              </div>
            ) : (
              <>
                <div className="audiobooks-book-grid">
                  {visibleBooks.map((book) => {
                    const progress = getAudiobookProgress(book.id)
                    const percent =
                      progress?.durationSeconds && progress.durationSeconds > 0
                        ? Math.min(100, Math.round((progress.positionSeconds / progress.durationSeconds) * 100))
                        : 0
                    return (
                      <BookCard
                        key={book.id}
                        book={book}
                        onOpen={onOpenBook}
                        onPlay={() => onOpenBook(book.id)}
                        tuning={tuningBookId === book.id}
                        progressPercent={percent}
                        ArtworkImage={ArtworkImage}
                      />
                    )
                  })}
                </div>
                {pagination?.hasMore ? (
                  <div className="audiobooks-section-actions">
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      disabled={loadingMore}
                      onClick={() => loadMore()}
                    >
                      {loadingMore ? 'Loading…' : 'Load more'}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
})
