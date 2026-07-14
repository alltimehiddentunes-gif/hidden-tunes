import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import './index.css'
import App from './App.tsx'

function showBootstrapError(message: string) {
  const root = document.getElementById('root')
  if (root) {
    root.innerHTML = `
      <div style="min-height:100vh;display:grid;place-items:center;padding:24px;background:#050508;color:#f5f3fa;font-family:Segoe UI,system-ui,sans-serif;">
        <div style="max-width:520px;padding:28px 32px;border-radius:16px;border:1px solid rgba(255,255,255,0.08);background:#13131d;">
          <h1 style="margin:0 0 12px;font-size:1.35rem;">Hidden Tunes Desktop</h1>
          <p style="margin:0;line-height:1.6;color:rgba(245,243,250,0.72);">${message}</p>
        </div>
      </div>
    `
    return
  }

  document.body.innerHTML = `<pre style="padding:24px;color:#f5f3fa;background:#050508;">${message}</pre>`
}

const rootElement = document.getElementById('root')

if (!rootElement) {
  showBootstrapError('The desktop shell could not find its root container.')
} else {
  try {
    createRoot(rootElement).render(
      <StrictMode>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </StrictMode>,
    )
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'The desktop shell failed to start.'
    showBootstrapError(message)
    console.error('[Hidden Tunes Desktop] bootstrap failed', error)
  }
}
