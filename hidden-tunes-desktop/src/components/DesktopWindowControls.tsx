import { useEffect, useState } from 'react'
import { useLocalization } from '../localization'

const MinimizeIcon = () => <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 11.5h10" /></svg>
const MaximizeIcon = () => <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="9" rx=".5" /></svg>
const RestoreIcon = () => <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 5.5V3.5h7v7h-2M3.5 5.5h7v7h-7z" /></svg>
const CloseIcon = () => <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" /></svg>

export function DesktopWindowControls() {
  const { t } = useLocalization()
  const desktopWindow = window.hiddenTunesDesktop?.window
  const [isMaximized, setIsMaximized] = useState(false)
  const [isFullScreen, setIsFullScreen] = useState(false)

  useEffect(() => {
    if (!desktopWindow) return
    let mounted = true
    void desktopWindow.getState().then((state) => {
      if (!mounted) return
      setIsMaximized(state.isMaximized)
      setIsFullScreen(state.isFullScreen)
    })
    const unsubscribe = desktopWindow.subscribeState((state) => {
      setIsMaximized(state.isMaximized)
      setIsFullScreen(state.isFullScreen)
    })
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [desktopWindow])

  useEffect(() => {
    document.documentElement.classList.toggle('ht-os-fullscreen', isFullScreen)
    return () => document.documentElement.classList.remove('ht-os-fullscreen')
  }, [isFullScreen])

  if (!desktopWindow || isFullScreen) return null

  return (
    <header className="desktop-titlebar" data-testid="desktop-titlebar">
      <div className="desktop-titlebar-drag-region" aria-hidden="true">
        <span className="desktop-titlebar-title">Hidden Tunes Desktop</span>
      </div>
      <div className="desktop-window-controls" role="group" aria-label="Window controls">
        <button type="button" onClick={() => void desktopWindow.minimize()} aria-label="Minimize window" title="Minimize"><MinimizeIcon /></button>
        <button type="button" onClick={() => void desktopWindow.toggleMaximize()} aria-label={isMaximized ? 'Restore window' : 'Maximize window'} title={isMaximized ? 'Restore Down' : 'Maximize'}>
          {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
        <button className="desktop-window-close" type="button" onClick={() => void desktopWindow.close()} aria-label={t('common.close')} title={t('common.close')}><CloseIcon /></button>
      </div>
    </header>
  )
}
