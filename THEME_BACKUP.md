# Theme backup

Snapshot of the current theme colors before an update, taken 2026-09-03.
Two sources of truth:

- App UI palette — `tailwind.config.js` (`theme.extend.colors.ink`)
- Editor theme `slim-dark` — `src/renderer/src/components/editor/setupMonaco.ts`

To restore, paste each block back into the file noted above.

---

## 1. App UI palette — `tailwind.config.js`

```js
ink: {
  bg: '#181818',        // editor background — deep gray
  panel: '#141414',     // sidebar / tab-bar background — darker gray
  elevated: '#1f1f1f',  // popovers, menus, tooltips (slightly raised)
  border: '#2a2a2a',    // subtle gray
  hover: '#232323',     // neutral hover lift
  active: '#163761',    // selection — blue tint
  selection: '#163761',
  text: '#d6d6dd',      // soft white
  muted: '#6d6d6d',     // gray
  accent: '#228df2',    // primary accent — bright blue
  accentHover: '#4aa3f5'
}
```

---

## 2. Editor syntax token palette — `setupMonaco.ts`

```js
const STRINGS    = 'e394dc'
const KEYWORDS   = '83d6c5'
const FUNCTIONS  = 'efb080'
const VARIABLES  = '94c1fa'
const TYPES      = '87c3ff'
const PROPERTIES = 'aa9bf5'
const NUMBERS    = 'ebc88d'
const COMMENTS   = '6d6d6d'
```

Additional literal token colors used in `themeRules`:

- `delimiter` → `d6d6dd`
- `comment` → italic

---

## 3. Editor `slim-dark` chrome colors — `setupMonaco.ts` (`defineTheme` → `colors`)

```js
{
  'editor.background': '#181818',
  'editor.foreground': '#d6d6dd',
  'editorLineNumber.foreground': '#6d6d6d',
  'editorLineNumber.activeForeground': '#d6d6dd',
  'editor.selectionBackground': '#163761',
  'editor.inactiveSelectionBackground': '#16376188',
  'editor.lineHighlightBackground': '#1f1f1f',
  'editor.lineHighlightBorder': '#00000000',
  'editorCursor.foreground': '#228df2',
  'editorGutter.background': '#181818',
  'editorWidget.background': '#141414',
  'editorWidget.border': '#2a2a2a',
  'editorSuggestWidget.background': '#141414',
  'editorSuggestWidget.selectedBackground': '#163761',
  'input.background': '#141414',
  'focusBorder': '#228df2',
  'scrollbarSlider.background': '#2a2a2a',
  'scrollbarSlider.hoverBackground': '#6d6d6d',
  'scrollbarSlider.activeBackground': '#6d6d6d'
}
```

---

## 4. Other hard-coded color references (for completeness)

- `src/main/window.ts` → `backgroundColor: '#181818'` (native window bg, matches `ink.bg`)
- `src/renderer/src/index.css` → scrollbar thumb uses `@apply bg-ink-border` / `bg-ink-muted`
