import { useMemo, useState } from 'react'
import { canonicalUrlForContent, isExactHiddenTunesUrl, shareMessageForContent, type ShareableContent } from '../../lib/contentSharing'
import './ContentShareActions.css'

type Props = { content: ShareableContent; compact?: boolean }

export default function ContentShareActions({ content, compact = false }: Props) {
  const [status, setStatus] = useState('')
  const [manualValue, setManualValue] = useState('')
  const url = useMemo(() => {
    try { return canonicalUrlForContent(content) } catch { return '' }
  }, [content])

  const copy = async (value: string, success: string) => {
    if (!url) return
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(value)
      setManualValue('')
      setStatus(success)
    } catch {
      setManualValue(value)
      setStatus('Clipboard access was denied. Select and copy the text below.')
    }
  }

  const share = async () => {
    if (!url) return
    if (!navigator.share) {
      await copy(shareMessageForContent(content), 'Title and link copied')
      return
    }
    try {
      await navigator.share({ title: content.title, text: shareMessageForContent(content), url })
      setStatus('Share sheet opened')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setStatus('Sharing is unavailable. Use Copy Link instead.')
    }
  }

  return (
    <div className={`content-share-actions${compact ? ' content-share-actions--compact' : ''}`} role="toolbar" aria-label={`Share ${content.title}`}>
      <button type="button" title="Share" disabled={!url} onClick={() => void share()}>Share</button>
      <button type="button" title="Copy canonical link" disabled={!url} onClick={() => void copy(url, 'Link copied')}>Copy Link</button>
      {!compact ? <button type="button" title="Copy title and canonical link" disabled={!url} onClick={() => void copy(shareMessageForContent(content), 'Title and link copied')}>Copy title + link</button> : null}
      {!compact && url && isExactHiddenTunesUrl(url) ? <a title="Open on Hidden Tunes Website" href={url} target="_blank" rel="noreferrer noopener">Open on Website</a> : null}
      <span className="content-share-actions__status" role="status" aria-live="polite">{status}</span>
      {manualValue ? <input className="content-share-actions__manual" aria-label="Manually copy this share text" readOnly value={manualValue} onFocus={(event) => event.currentTarget.select()} /> : null}
    </div>
  )
}
