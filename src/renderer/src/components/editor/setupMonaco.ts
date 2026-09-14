// Configure Monaco to run FULLY OFFLINE from the locally bundled package.
//
// The app CSP is `script-src 'self'` (no CDN allowed). By default
// @monaco-editor/react loads Monaco from a CDN, which would be blocked. Here we:
//   1) Point the loader at the local `monaco-editor` package (loader.config).
//   2) Wire MonacoEnvironment.getWorker to Vite-bundled web workers (?worker),
//      so language services (TS/JSON/CSS/HTML) work without network access.
//
// This is a module-scope side effect: importing this file once (from EditorView)
// runs the setup before any editor mounts. Works in the packaged app too.

import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
import { registerMonacoThemeDefiner } from '../../lib/theme'
import type { SyntaxColors, ThemePalette } from '../../lib/themes'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

;(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker(_: unknown, label: string): Worker {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  }
}

// Use the local package instead of the default CDN.
loader.config({ monaco })

// --- dotenv (.env / .env.*) ------------------------------------------------
// Monaco ships no dotenv grammar, so register a small line-oriented one. Tokens
// map onto the shared theme rules below (key→variable, #→comment, quotes→string,
// ${VAR}→variable, numbers/booleans→number/constant), so it themes for free in
// both light and dark. Registered here at module load, before any editor mounts.
monaco.languages.register({ id: 'dotenv', aliases: ['dotenv', 'Env'] })

monaco.languages.setLanguageConfiguration('dotenv', {
  comments: { lineComment: '#' },
  brackets: [['{', '}']],
  autoClosingPairs: [
    { open: '"', close: '"' },
    { open: "'", close: "'" },
    { open: '`', close: '`' },
    { open: '{', close: '}' }
  ],
  surroundingPairs: [
    { open: '"', close: '"' },
    { open: "'", close: "'" },
    { open: '`', close: '`' }
  ]
})

monaco.languages.setMonarchTokensProvider('dotenv', {
  // Keys are case-sensitive; the grammar is intentionally line-oriented and
  // stateless so it can't hang on odd input (no cross-line string states).
  tokenizer: {
    root: [
      // Whole-line comment.
      [/^\s*#.*$/, 'comment'],
      // Bash-style `export ` prefix sometimes used in .env files.
      [/\bexport\b/, 'keyword'],
      // KEY before the `=` (lookahead keeps the `=` for the operator rule).
      [/[A-Za-z_][A-Za-z0-9_.]*(?=\s*=)/, 'variable'],
      [/=/, 'operator'],
      // Quoted values (double/single/back-tick).
      [/"([^"\\]|\\.)*"/, 'string'],
      [/'[^']*'/, 'string'],
      [/`([^`\\]|\\.)*`/, 'string'],
      // ${VAR} / $VAR interpolation.
      [/\$\{[^}]*\}/, 'variable'],
      [/\$[A-Za-z_][A-Za-z0-9_]*/, 'variable'],
      // Bare literals.
      [/\b(true|false|null)\b/, 'constant'],
      [/\b\d+(\.\d+)?\b/, 'number'],
      // Inline comment: whitespace then `#` to end of line.
      [/\s#.*$/, 'comment']
    ]
  }
})

// Syntax token palette (see the app theme spec).
//   strings #e394dc · keywords #83d6c5 · functions #efb080 · variables #94c1fa
//   classes/types #87c3ff · properties #aa9bf5 · numbers #ebc88d · comments #6d6d6d
// Monaco colors both the syntactic (Monarch) tokens and — with semantic
// highlighting enabled on the editor — the richer semantic tokens from the TS


/** Monaco token rules from a palette's syntax colours (Monarch + TS semantic tokens). */
function rulesFor(sx: SyntaxColors): monaco.editor.ITokenThemeRule[] {
  return [
    { token: 'comment', foreground: sx.comments, fontStyle: 'italic' },
    { token: 'string', foreground: sx.strings },
    { token: 'string.escape', foreground: sx.strings },
    { token: 'regexp', foreground: sx.strings },
    { token: 'keyword', foreground: sx.keywords },
    { token: 'keyword.flow', foreground: sx.keywords },
    { token: 'operator', foreground: sx.keywords },
    { token: 'number', foreground: sx.numbers },
    { token: 'number.hex', foreground: sx.numbers },
    { token: 'constant', foreground: sx.numbers },
    { token: 'type', foreground: sx.types },
    { token: 'type.identifier', foreground: sx.types },
    { token: 'identifier', foreground: sx.variables },
    { token: 'delimiter', foreground: sx.text },
    { token: 'tag', foreground: sx.keywords },
    { token: 'attribute.name', foreground: sx.properties },
    { token: 'attribute.value', foreground: sx.strings },
    { token: 'variable', foreground: sx.variables },
    { token: 'parameter', foreground: sx.variables },
    { token: 'property', foreground: sx.properties },
    { token: 'enumMember', foreground: sx.properties },
    { token: 'function', foreground: sx.functions },
    { token: 'method', foreground: sx.functions },
    { token: 'class', foreground: sx.types },
    { token: 'interface', foreground: sx.types },
    { token: 'enum', foreground: sx.types },
    { token: 'type.semantic', foreground: sx.types },
    { token: 'typeParameter', foreground: sx.types },
    { token: 'namespace', foreground: sx.types }
  ]
}

/** Define a Monaco theme (editor chrome + syntax) from a palette. */
export function defineMonacoTheme(p: ThemePalette, name: string): void {
  const dark = p.appearance === 'dark'
  monaco.editor.defineTheme(name, {
    base: dark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: rulesFor(p.syntax),
    colors: {
      'editor.background': p.ink.panel,
      'editor.foreground': '#' + p.syntax.text,
      'editorLineNumber.foreground': p.ink.muted,
      'editorLineNumber.activeForeground': p.ink.text,
      'editor.selectionBackground': p.ink.active,
      'editor.inactiveSelectionBackground': p.ink.active + '88',
      'editor.lineHighlightBackground': p.ink.elevated,
      'editor.lineHighlightBorder': '#00000000',
      'editorCursor.foreground': p.ink.accent,
      'editorGutter.background': p.ink.panel,
      'editorWidget.background': p.ink.panel,
      'editorWidget.border': p.ink.border,
      'editorSuggestWidget.background': p.ink.panel,
      'editorSuggestWidget.selectedBackground': p.ink.active,
      'input.background': p.ink.panel,
      focusBorder: p.ink.accent,
      // Match the file-explorer scrollbar: solid ink-border thumb, ink-muted on
      // hover/drag (the native ::-webkit-scrollbar in index.css uses the same).
      'scrollbarSlider.background': p.ink.border,
      'scrollbarSlider.hoverBackground': p.ink.muted,
      'scrollbarSlider.activeBackground': p.ink.muted
    }
  })
}
registerMonacoThemeDefiner(defineMonacoTheme)

// --- Single-file TS/JS intelligence tuning -------------------------------
// Monaco's built-in TS worker type-checks each file in ISOLATION — no project
// graph, no @types, no tsconfig. On real projects that produces a flood of
// FALSE semantic errors: "cannot find module './x'", "cannot find name
// 'process'", missing JSX types, etc. Since this IDE has no LSP by design
// (spec §1) and edits arbitrary projects, we disable SEMANTIC validation and
// keep SYNTAX validation — clean highlighting + real syntax errors, no noise.
// (Real type intelligence lives in the terminal / Claude Code, per the spec.)
const ts = monaco.languages.typescript
const compilerOptions: import('monaco-editor').languages.typescript.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  jsx: ts.JsxEmit.ReactJSX,
  allowJs: true,
  allowNonTsExtensions: true,
  esModuleInterop: true,
  skipLibCheck: true,
  noEmit: true
}
const diagnosticsOptions = {
  noSemanticValidation: true,
  noSyntaxValidation: false,
  noSuggestionDiagnostics: true
}

ts.typescriptDefaults.setCompilerOptions(compilerOptions)
ts.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions)
ts.javascriptDefaults.setCompilerOptions(compilerOptions)
ts.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions)
