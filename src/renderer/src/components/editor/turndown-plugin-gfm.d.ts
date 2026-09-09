// The `turndown-plugin-gfm` package ships no type declarations. It exports
// Turndown plugins (functions passed to `TurndownService.use`).
declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown'
  type Plugin = TurndownService.Plugin
  export const gfm: Plugin
  export const tables: Plugin
  export const strikethrough: Plugin
  export const taskListItems: Plugin
  export const highlightedCodeBlock: Plugin
}
