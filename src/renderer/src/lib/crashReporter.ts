// ---------------------------------------------------------------------------
// Renderer-side crash forwarding.
//
// Catches uncaught errors and unhandled promise rejections in the renderer and
// ships them to the main process, which persists them alongside main-process
// crashes (see main/logger.ts). The React error boundary reports through the
// same `window.ide.logs.report` channel.
// ---------------------------------------------------------------------------

let installed = false

/** Install window-level error listeners once. Safe to call multiple times. */
export function installRendererCrashReporting(): void {
  if (installed) return
  installed = true

  window.addEventListener('error', (event) => {
    const err = event.error as Error | undefined
    void window.ide.logs.report({
      type: 'renderer-error',
      message: err?.message || event.message || 'Unknown renderer error',
      stack: err?.stack,
      details: {
        filename: event.filename,
        line: event.lineno,
        column: event.colno
      }
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as unknown
    const err = reason instanceof Error ? reason : undefined
    void window.ide.logs.report({
      type: 'renderer-unhandledrejection',
      message: err?.message || (typeof reason === 'string' ? reason : 'Unhandled promise rejection'),
      stack: err?.stack
    })
  })
}
