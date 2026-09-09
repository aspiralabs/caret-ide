# Debugging & Crash Reports

Caret captures unexpected failures across every process and writes each one as a JSON report to the local machine. Use this file to point Claude (or yourself) at the right folder when debugging.

## Where the crash reports live

Reports are written to a `crash-reports/` directory inside the app's `userData` folder. The exact path depends on whether you're running the **packaged** app or the **dev** server (they use separate, isolated userData dirs on purpose).

  

### macOS

| Build | Path |
| --- | --- |
| Packaged (.app) | `~/Library/Application Support/Caret/crash-reports/` |
| Dev (`npm run dev`) | `~/Library/Application Support/Caret-dev/crash-reports/` |

> The `-dev` suffix comes from `src/main/index.ts`, which isolates the hot-reload dev instance from the built app so their single-instance locks don't collide.

Quick open from a terminal:

```sh
open ~/Library/Application\ Support/Caret/crash-reports/        # packaged
open ~/Library/Application\ Support/Caret-dev/crash-reports/    # dev
```

### Windows

-   Packaged: `%APPDATA%\Caret\crash-reports\`
-   Dev: `%APPDATA%\Caret-dev\crash-reports\`

### Linux

-   Packaged: `~/.config/Caret/crash-reports/`
-   Dev: `~/.config/Caret-dev/crash-reports/`

The app identity is `productName: Caret` / `appId: co.aspiralabs.caret` (`electron-builder.yml`).

## Viewing reports inside the app

-   Click the **⚠ Diagnostics** button at the far right of the bottom status bar. It shows a badge with the number of stored reports and turns amber when > 0.
-   The Diagnostics panel lists every report (newest first) with full message, stack trace, extra details, and the environment (app/Electron/Chrome/Node versions, platform, arch).
-   **Reveal in Finder** opens the selected report file (or the folder) in the OS file manager. **Clear all** deletes every stored report.

## Report file format

One `<timestamp>__<type>.json` file per crash, e.g. `2026-09-03T14-22-01-123Z__uncaughtException.json`. Each contains:

```jsonc
{
  "id": "...",
  "timestamp": "2026-09-03T14:22:01.123Z",
  "type": "uncaughtException",          // see "What gets captured" below
  "source": "main",                     // main | renderer | gpu | child
  "message": "...",
  "stack": "...",                        // when available
  "details": { /* extra context */ },
  "app": { "version", "electron", "chrome", "node", "platform", "arch" },
  "project": "/abs/path/to/project"      // reporting window's project, when known
}
```

The newest **200** reports are kept; older ones are pruned automatically.

## What gets captured

| Source | How | `type` |
| --- | --- | --- |
| Main process | \`process.on('uncaughtException' | 'unhandledRejection')\` |
| Renderer JS | `window.onerror`, `unhandledrejection` (forwarded via IPC) | `renderer-error`, `renderer-unhandledrejection` |
| React render | Top-level `ErrorBoundary` | `renderer-react` |
| Crashed renderer | `app.on('render-process-gone')` | `render-process-gone` |
| GPU / child procs | `app.on('child-process-gone')` | `child-process-gone` |

Every report is also mirrored to the console (`[crash] <type>: <message>`), so it shows up in the terminal (main process) and DevTools (renderer) too.

## Relevant source files

-   `src/main/logger.ts` — capture handlers, file persistence, `logs` IPC.
-   `src/renderer/src/lib/crashReporter.ts` — renderer error forwarding.
-   `src/renderer/src/components/ErrorBoundary.tsx` — React render-error fallback.
-   `src/renderer/src/components/Diagnostics.tsx` — in-app report viewer.
-   `src/shared/types.ts` / `src/shared/ipc.ts` — shared report types & channels.
