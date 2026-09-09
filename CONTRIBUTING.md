# Contributing to Caret

Thanks for your interest in improving Caret! This is a three-panel Electron IDE
built for working alongside Claude Code. Contributions of all sizes are welcome —
bug reports, docs, and code.

## Ground rules

- Be respectful and constructive. We want this to be a friendly project to work on.
- Keep changes focused: one logical change per pull request.
- Match the style of the surrounding code (naming, comments, structure). The codebase
  favors small, well-commented modules — new code should read like the existing code.

## Development setup

Requirements: macOS on Apple Silicon (arm64), Node 20+, and the Xcode Command Line
Tools (`xcode-select --install`) to compile `node-pty`.

```bash
npm install        # installs deps + rebuilds node-pty against Electron's ABI
npm run dev        # launch in development with HMR
```

See the [README](./README.md) for the full script list and architecture overview.

## Before you open a pull request

1. **Type-check:** `npm run typecheck` (runs both the node and web TS projects) must pass.
2. **Build:** `npm run build` should succeed.
3. **Smoke test** the packaged behavior when touching native integrations (pty / browser):
   ```bash
   SMOKE_TEST=1 SMOKE_PROJECT="$(pwd)" npx electron .
   ```
4. **Manually verify** UI/behavior changes in a real window (`npm run dev`), since the app
   has no automated UI test suite yet.

## Pull request process

1. Fork the repo and create a branch off `main` (e.g. `fix/preview-live-update`).
2. Make your change, keeping commits clean and descriptive.
3. Ensure type-check + build pass, and describe how you verified the change in the PR.
4. Open the PR against `main`. A maintainer will review it.

## Reporting bugs

Open an issue with:

- What you expected vs. what happened
- Steps to reproduce
- Your macOS + Node versions, and whether it reproduces in `npm run dev` or only the
  packaged app

## Scope & philosophy

Caret is intentionally minimal (see [`ide-spec.md`](./ide-spec.md)): real language
intelligence lives in the terminal / Claude Code, not an in-app LSP. Please open an
issue to discuss larger features or architectural changes before investing in them, so
we can make sure they fit the project's direction.
