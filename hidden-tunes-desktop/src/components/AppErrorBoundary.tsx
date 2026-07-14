import { Component, type ErrorInfo, type ReactNode } from 'react'

type AppErrorBoundaryProps = {
  children: ReactNode
}

type AppErrorBoundaryState = {
  error: Error | null
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[ht-desktop] render error', error, info.componentStack)
    }
  }

  private handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.error) {
      return this.props.children
    }

    const message = this.state.error.message || 'The desktop shell stopped unexpectedly.'

    return (
      <div className="app-error-fallback" role="alert">
        <div className="app-error-fallback-card">
          <h1>Hidden Tunes Desktop</h1>
          <p>{message}</p>
          <p className="app-error-fallback-detail">
            This can happen after a hot reload during development. Reload the app to restore the shell.
          </p>
          <button type="button" className="btn-primary" onClick={this.handleReload}>
            Reload app
          </button>
        </div>
      </div>
    )
  }
}
