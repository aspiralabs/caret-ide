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
// worker (which distinguish function/variable/property/class). Rules cover both.
const STRINGS = 'e394dc'
const KEYWORDS = '83d6c5'
const FUNCTIONS = 'efb080'
const VARIABLES = '94c1fa'
const TYPES = '87c3ff'
const PROPERTIES = 'aa9bf5'
const NUMBERS = 'ebc88d'
const COMMENTS = '6d6d6d'

const themeRules = [
  // --- syntactic (Monarch) ---
  { token: 'comment', foreground: COMMENTS, fontStyle: 'italic' },
  { token: 'string', foreground: STRINGS },
  { token: 'string.escape', foreground: STRINGS },
  { token: 'regexp', foreground: STRINGS },
  { token: 'keyword', foreground: KEYWORDS },
  { token: 'keyword.flow', foreground: KEYWORDS },
  { token: 'operator', foreground: KEYWORDS },
  { token: 'number', foreground: NUMBERS },
  { token: 'number.hex', foreground: NUMBERS },
  { token: 'constant', foreground: NUMBERS },
  { token: 'type', foreground: TYPES },
  { token: 'type.identifier', foreground: TYPES },
  { token: 'identifier', foreground: VARIABLES },
  { token: 'delimiter', foreground: 'd6d6dd' },
  { token: 'tag', foreground: KEYWORDS },
  { token: 'attribute.name', foreground: PROPERTIES },
  { token: 'attribute.value', foreground: STRINGS },
  // --- semantic (TS worker) ---
  { token: 'variable', foreground: VARIABLES },
  { token: 'parameter', foreground: VARIABLES },
  { token: 'property', foreground: PROPERTIES },
  { token: 'enumMember', foreground: PROPERTIES },
  { token: 'function', foreground: FUNCTIONS },
  { token: 'method', foreground: FUNCTIONS },
  { token: 'class', foreground: TYPES },
  { token: 'interface', foreground: TYPES },
  { token: 'enum', foreground: TYPES },
  { token: 'type.semantic', foreground: TYPES },
  { token: 'typeParameter', foreground: TYPES },
  { token: 'namespace', foreground: TYPES }
]

// Dark app theme (matches the dark ink palette in index.css / tailwind.config.js).
monaco.editor.defineTheme('slim-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: themeRules,
  colors: {
    'editor.background': '#141414',
    'editor.foreground': '#d6d6dd',
    'editorLineNumber.foreground': '#6d6d6d',
    'editorLineNumber.activeForeground': '#d6d6dd',
    'editor.selectionBackground': '#163761',
    'editor.inactiveSelectionBackground': '#16376188',
    'editor.lineHighlightBackground': '#1f1f1f',
    'editor.lineHighlightBorder': '#00000000',
    'editorCursor.foreground': '#228df2',
    'editorGutter.background': '#141414',
    'editorWidget.background': '#141414',
    'editorWidget.border': '#2a2a2a',
    'editorSuggestWidget.background': '#141414',
    'editorSuggestWidget.selectedBackground': '#163761',
    'input.background': '#141414',
    'focusBorder': '#228df2',
    // Match the file-explorer scrollbar: solid ink-border thumb, ink-muted on
    // hover/drag (the native ::-webkit-scrollbar in index.css uses the same).
    'scrollbarSlider.background': '#2a2a2a',
    'scrollbarSlider.hoverBackground': '#6d6d6d',
    'scrollbarSlider.activeBackground': '#6d6d6d'
  }
})

// Light syntax palette (One Light) — a cohesive, well-tested set that reads
// well on a white editor background, mirroring the light ink palette.
const L_STRINGS = '50a14f' // green
const L_KEYWORDS = 'a626a4' // purple
const L_FUNCTIONS = '4078f2' // blue
const L_VARIABLES = 'e45649' // red
const L_TYPES = 'c18401' // gold — classes / types
const L_PROPERTIES = '4078f2' // blue
const L_NUMBERS = '986801' // orange
const L_COMMENTS = 'a0a1a7' // gray
const L_TEXT = '383a42' // near-black default foreground

const lightThemeRules = [
  // --- syntactic (Monarch) ---
  { token: 'comment', foreground: L_COMMENTS, fontStyle: 'italic' },
  { token: 'string', foreground: L_STRINGS },
  { token: 'string.escape', foreground: L_STRINGS },
  { token: 'regexp', foreground: L_STRINGS },
  { token: 'keyword', foreground: L_KEYWORDS },
  { token: 'keyword.flow', foreground: L_KEYWORDS },
  { token: 'operator', foreground: L_KEYWORDS },
  { token: 'number', foreground: L_NUMBERS },
  { token: 'number.hex', foreground: L_NUMBERS },
  { token: 'constant', foreground: L_NUMBERS },
  { token: 'type', foreground: L_TYPES },
  { token: 'type.identifier', foreground: L_TYPES },
  { token: 'identifier', foreground: L_VARIABLES },
  { token: 'delimiter', foreground: L_TEXT },
  { token: 'tag', foreground: L_KEYWORDS },
  { token: 'attribute.name', foreground: L_PROPERTIES },
  { token: 'attribute.value', foreground: L_STRINGS },
  // --- semantic (TS worker) ---
  { token: 'variable', foreground: L_VARIABLES },
  { token: 'parameter', foreground: L_VARIABLES },
  { token: 'property', foreground: L_PROPERTIES },
  { token: 'enumMember', foreground: L_PROPERTIES },
  { token: 'function', foreground: L_FUNCTIONS },
  { token: 'method', foreground: L_FUNCTIONS },
  { token: 'class', foreground: L_TYPES },
  { token: 'interface', foreground: L_TYPES },
  { token: 'enum', foreground: L_TYPES },
  { token: 'type.semantic', foreground: L_TYPES },
  { token: 'typeParameter', foreground: L_TYPES },
  { token: 'namespace', foreground: L_TYPES }
]

// Light app theme (matches the light ink palette in index.css).
monaco.editor.defineTheme('slim-light', {
  base: 'vs',
  inherit: true,
  rules: lightThemeRules,
  colors: {
    'editor.background': '#ffffff',
    'editor.foreground': '#383a42',
    'editorLineNumber.foreground': '#b0b3bb',
    'editorLineNumber.activeForeground': '#383a42',
    'editor.selectionBackground': '#d3e5fb',
    'editor.inactiveSelectionBackground': '#d3e5fb88',
    'editor.lineHighlightBackground': '#f2f3f5',
    'editor.lineHighlightBorder': '#00000000',
    'editorCursor.foreground': '#0969da',
    'editorGutter.background': '#ffffff',
    'editorWidget.background': '#ffffff',
    'editorWidget.border': '#e0e2e6',
    'editorSuggestWidget.background': '#ffffff',
    'editorSuggestWidget.selectedBackground': '#d3e5fb',
    'input.background': '#ffffff',
    'focusBorder': '#0969da',
    'scrollbarSlider.background': '#e0e2e6',
    'scrollbarSlider.hoverBackground': '#c0c4cc',
    'scrollbarSlider.activeBackground': '#c0c4cc'
  }
})

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
