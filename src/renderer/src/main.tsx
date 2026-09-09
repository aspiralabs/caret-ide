import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import WelcomeScreen from './components/WelcomeScreen'
import ErrorBoundary from './components/ErrorBoundary'
import { installRendererCrashReporting } from './lib/crashReporter'
import './index.css'

// Forward uncaught renderer errors / rejections to the main-process crash log.
installRendererCrashReporting()

// A `#welcome` hash means this window is the project-less start screen (main
// launches it with no project). Boot that instead of the full IDE, whose
// project-scoped IPC would throw on a window with no project.
const isWelcome = window.location.hash.replace(/^#/, '') === 'welcome'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>{isWelcome ? <WelcomeScreen /> : <App />}</ErrorBoundary>
  </React.StrictMode>
)
