import { useEffect, useRef, useState } from 'react'
import { fetchAudiobookDetail } from './audiobookCatalogApi'
import type { AudiobookBookMeta, AudiobookChapterMeta } from './types'

function readError(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback
}

export function useAudiobookBookData(bookId: string | null) {
  const [book, setBook] = useState<AudiobookBookMeta | null>(null)
  const [chapters, setChapters] = useState<AudiobookChapterMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)

  useEffect(() => {
    const cleanId = bookId?.trim() ?? ''
    if (!cleanId) {
      setBook(null)
      setChapters([])
      setLoading(false)
      setError(null)
      return
    }

    const requestId = ++requestRef.current
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetchAudiobookDetail(cleanId, controller.signal)
      .then((detail) => {
        if (requestId !== requestRef.current) return
        if (!detail) {
          setBook(null)
          setChapters([])
          setError('This audiobook could not be found.')
          return
        }
        setBook(detail.audiobook)
        setChapters(detail.chapters)
      })
      .catch((reason) => {
        if (requestId !== requestRef.current) return
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setBook(null)
        setChapters([])
        setError(readError(reason, 'Could not load this audiobook.'))
      })
      .finally(() => {
        if (requestId === requestRef.current) setLoading(false)
      })

    return () => controller.abort()
  }, [bookId])

  return { book, chapters, loading, error }
}
