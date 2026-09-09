/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // App palette driven by CSS variables so the whole UI can swap between
        // the dark and light themes at runtime (see src/renderer/src/index.css
        // for the `:root` dark values and `.theme-light` overrides). Each var is
        // an "R G B" triplet so Tailwind's `/<alpha>` opacity modifier keeps
        // working (e.g. `bg-ink-accent/10`, `border-ink-border/60`).
        ink: {
          bg: 'rgb(var(--ink-bg) / <alpha-value>)', // editor background
          panel: 'rgb(var(--ink-panel) / <alpha-value>)', // tab-bar / title-bar / status-bar
          sidebar: 'rgb(var(--ink-sidebar) / <alpha-value>)', // file explorer background
          terminal: 'rgb(var(--ink-terminal) / <alpha-value>)', // terminal background
          elevated: 'rgb(var(--ink-elevated) / <alpha-value>)', // popovers, menus, tooltips
          border: 'rgb(var(--ink-border) / <alpha-value>)', // subtle divider
          hover: 'rgb(var(--ink-hover) / <alpha-value>)', // neutral hover lift
          active: 'rgb(var(--ink-active) / <alpha-value>)', // selection tint
          selection: 'rgb(var(--ink-selection) / <alpha-value>)',
          text: 'rgb(var(--ink-text) / <alpha-value>)', // primary foreground
          muted: 'rgb(var(--ink-muted) / <alpha-value>)', // secondary foreground
          tree: 'rgb(var(--ink-tree) / <alpha-value>)', // file-tree item label
          accent: 'rgb(var(--ink-accent) / <alpha-value>)', // primary accent
          accentHover: 'rgb(var(--ink-accent-hover) / <alpha-value>)'
        }
      },
      fontFamily: {
        mono: ['SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      }
    }
  },
  plugins: []
}
