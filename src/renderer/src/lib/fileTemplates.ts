/** "New file from template" entries (context menu). `body` gets the chosen basename. */
export interface FileTemplate {
  id: string
  label: string
  /** Default file name offered in the prompt. */
  defaultName: string
  body: (name: string) => string
}

/** PascalCase from a file name: `nav-bar.tsx` → `NavBar`. */
export function componentName(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, '')
  return stem
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join('') || 'Component'
}

export const FILE_TEMPLATES: FileTemplate[] = [
  {
    id: 'ts',
    label: 'TypeScript module',
    defaultName: 'module.ts',
    body: () => 'export {}\n'
  },
  {
    id: 'react',
    label: 'React component (.tsx)',
    defaultName: 'Component.tsx',
    body: (name) => {
      const c = componentName(name)
      return `export default function ${c}(): JSX.Element {\n  return <div>${c}</div>\n}\n`
    }
  },
  {
    id: 'test',
    label: 'Vitest test (.test.ts)',
    defaultName: 'thing.test.ts',
    body: (name) => {
      const subject = name.replace(/\.test\.tsx?$/, '')
      return `import { describe, expect, it } from 'vitest'\n\ndescribe('${subject}', () => {\n  it('works', () => {\n    expect(true).toBe(true)\n  })\n})\n`
    }
  },
  {
    id: 'md',
    label: 'Markdown document',
    defaultName: 'NOTES.md',
    body: (name) => `# ${name.replace(/\.[^.]+$/, '')}\n\n`
  },
  {
    id: 'json',
    label: 'JSON file',
    defaultName: 'data.json',
    body: () => '{\n}\n'
  },
  {
    id: 'sh',
    label: 'Shell script',
    defaultName: 'script.sh',
    body: () => '#!/usr/bin/env bash\nset -euo pipefail\n\n'
  }
]
