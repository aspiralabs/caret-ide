import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { installRendererCrashReporting } from './lib/crashReporter'
import './index.css'

// Forward uncaught renderer errors / rejections to the main-process crash log.
installRendererCrashReporting()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
