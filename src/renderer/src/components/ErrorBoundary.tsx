import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Top-level React error boundary. A render error would otherwise blank the
 * whole app; instead we record it to disk (via the same crash-report channel)
 * and show a recoverable fallback with a reload action.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    void window.ide.logs.report({
      type: 'renderer-react',
      message: error.message || 'React render error',
      stack: error.stack,
      details: { componentStack: info.componentStack }
    })
  }

  private reload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-ink-bg p-8 text-center">
        <div className="text-lg font-medium text-ink-text">Something went wrong</div>
        <div className="max-w-lg break-words text-sm text-ink-muted">{error.message}</div>
        <div className="text-xs text-ink-muted">
          A crash report was saved. Open Diagnostics from the status bar to view it.
        </div>
        <div className="flex gap-2">
          <button
            onClick={this.reload}
            className="rounded bg-ink-accent px-3 py-1.5 text-sm text-white hover:opacity-90"
          >
            Reload
          </button>
          <button
            onClick={() => void window.ide.logs.reveal()}
            className="rounded border border-ink-border px-3 py-1.5 text-sm text-ink-text hover:bg-ink-panel"
          >
            Open logs folder
          </button>
        </div>
      </div>
    )
  }
}
