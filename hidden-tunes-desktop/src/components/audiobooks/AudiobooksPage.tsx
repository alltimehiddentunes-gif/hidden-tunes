import { memo, useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
import {
  audiobookCategoryLabel,
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
  progressPercent,
  ArtworkImage,
}: {
  book: AudiobookBookMeta
  onOpen: (bookId: string) => void
  progressPercent: number
  ArtworkImage: ComponentType<ArtworkImageProps>
}) {
  return (
    <article className="audiobook-book-card">
      <button
        type="button"
        className="audiobook-book-card-hit"
        onClick={() => onOpen(book.id)}
        aria-label={`Open ${book.title}`}
      >
        <div className="audiobook-book-card-art">
          <ArtworkImage src={book.coverUrl} alt="" seed={book.id} label={book.title} />
          {progressPercent > 0 ? (
            <span className="audiobook-progress-pill">{progressPercent}%</span>
          ) : null}
          <span className="audiobook-book-card-play" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </div>
        <div className="audiobook-book-card-copy">
          <h3>{book.title}</h3>
          <p>{formatAudiobookBookSubtitle(book)}</p>
        </div>
      </button>
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
  const [languageFilter, setLanguageFilter] = useState<string | null>(null)
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null)
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
    languageOptions,
    loadMore,
  } = useAudiobooksPageData(query, categorySlug, languageFilter)

  useEffect(() => {
    const node = loadMoreSentinelRef.current
    if (!node || !pagination?.hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore()
      },
      { rootMargin: '240px 0px' },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [loadMore, pagination?.hasMore])

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
      onPlayAudiobookChapter(book, chapter, [chapter], 0, book.title, {
        resumePositionSeconds: progress.positionSeconds,
      })
    },
    [onPlayAudiobookChapter],
  )

  const heroProgress = heroBook ? getAudiobookProgress(heroBook.id) : null

  return (
    <div className="audiobooks-destination">
      <section className="audiobooks-hero" aria-labelledby="audiobooks-hero-title">
        {heroBook ? (
          <div className="audiobooks-hero-grid">
            <div className="audiobooks-hero-cover">
              <ArtworkImage
                src={heroBook.coverUrl}
                alt=""
                seed={heroBook.id}
                label={heroBook.title}
                priority
              />
            </div>

            <div className="audiobooks-hero-main">
              <span className="audiobooks-hero-eyebrow">
                {audiobookCategoryLabel(heroBook.categorySlug ?? heroBook.categories[0] ?? null)}
              </span>
              <h2 id="audiobooks-hero-title">{heroBook.title}</h2>
              <p className="audiobooks-hero-author">
                {heroBook.authorName ?? 'Unknown author'}
                {heroBook.narratorName && heroBook.narratorName !== heroBook.authorName
                  ? ` · Narrated by ${heroBook.narratorName}`
                  : ''}
              </p>
              <ul className="audiobooks-hero-meta">
                {heroBook.language ? <li>{heroBook.language}</li> : null}
                {heroBook.chapterCount > 0 ? (
                  <li>{heroBook.chapterCount} {heroBook.chapterCount === 1 ? 'chapter' : 'chapters'}</li>
                ) : null}
                {heroBook.durationSeconds ? (
                  <li>{formatAudiobookDuration(heroBook.durationSeconds)}</li>
                ) : null}
              </ul>
              {heroBook.description ? (
                <p className="audiobooks-hero-description">{heroBook.description.slice(0, 220)}</p>
              ) : null}
            </div>

            <div className="audiobooks-hero-actions-col">
              {heroProgress ? (
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={() => resumeBook(heroBook.id)}
                >
                  Resume
                </button>
              ) : null}
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => onOpenBook(heroBook.id)}
              >
                View Book
              </button>
            </div>
          </div>
        ) : (
          <div className="audiobooks-hero-fallback">
            <h1 id="audiobooks-hero-title">Audiobooks</h1>
            <p>Long-form listening for focus, travel, and quiet hours.</p>
          </div>
        )}
      </section>

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
                {continueListening.map((entry) => {
                  const percent =
                    entry.durationSeconds && entry.durationSeconds > 0
                      ? Math.min(100, Math.round((entry.positionSeconds / entry.durationSeconds) * 100))
                      : 0
                  return (
                    <article key={entry.bookId} className="audiobooks-continue-card">
                      <div className="audiobooks-continue-art">
                        <ArtworkImage
                          src={entry.artworkUrl}
                          alt=""
                          seed={entry.bookId}
                          label={entry.bookTitle}
                        />
                      </div>
                      <div className="audiobooks-continue-copy">
                        <h3>{entry.bookTitle}</h3>
                        <p>{entry.chapterTitle}</p>
                        {percent > 0 ? (
                          <div className="audiobooks-continue-progress" aria-hidden="true">
                            <span style={{ width: `${percent}%` }} />
                          </div>
                        ) : null}
                        <span className="audiobooks-continue-meta">
                          {formatAudiobookDuration(entry.durationSeconds)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        onClick={() => resumeBook(entry.bookId)}
                      >
                        Resume
                      </button>
                    </article>
                  )
                })}
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
                    progressPercent={0}
                    ArtworkImage={ArtworkImage}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {categories.length > 0 && !filteredView ? (
            <section className="audiobooks-section" aria-labelledby="audiobooks-categories-heading">
              <h2 id="audiobooks-categories-heading">Categories</h2>
              <div className="audiobooks-category-grid">
                <button
                  type="button"
                  className={`audiobooks-category-card${categorySlug === null ? ' is-active' : ''}`}
                  onClick={() => setCategorySlug(null)}
                >
                  <strong>All Audiobooks</strong>
                  <span>Browse the full catalog</span>
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    className={`audiobooks-category-card${categorySlug === category.slug ? ' is-active' : ''}`}
                    onClick={() => setCategorySlug(category.slug)}
                  >
                    <strong>{category.title}</strong>
                    {category.itemCount > 0 ? (
                      <span>{category.itemCount.toLocaleString()} books</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {languageOptions.length > 0 && !query.trim() ? (
            <section className="audiobooks-section" aria-labelledby="audiobooks-languages-heading">
              <h2 id="audiobooks-languages-heading">Languages</h2>
              <div className="audiobooks-category-grid">
                <button
                  type="button"
                  className={`audiobooks-category-card${languageFilter === null ? ' is-active' : ''}`}
                  onClick={() => setLanguageFilter(null)}
                >
                  <strong>All Languages</strong>
                </button>
                {languageOptions.map((language) => (
                  <button
                    key={language}
                    type="button"
                    className={`audiobooks-category-card${languageFilter === language ? ' is-active' : ''}`}
                    onClick={() => setLanguageFilter(language)}
                  >
                    <strong>{language}</strong>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {recentlyPlayed.length > 0 && !filteredView ? (
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
                        progressPercent={percent}
                        ArtworkImage={ArtworkImage}
                      />
                    )
                  })}
                </div>
                <div ref={loadMoreSentinelRef} className="audiobooks-load-sentinel" aria-hidden="true" />
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
