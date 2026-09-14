import { basename, extname } from '../../lib/path'

// True for `.env`, `.env.local`, `.env.production`, `foo.env`, etc. Env files
// need basename matching, not extname: `extname('.env')` is '' (a leading dot is
// the filename, not an extension), and `extname('.env.local')` is '.local'.
function isDotenv(path: string): boolean {
  const base = basename(path).toLowerCase()
  return base === '.env' || base.startsWith('.env.') || base.endsWith('.env')
}

/** Extension → Monaco language id. Monaco ships Monarch grammars for all of these. */
const BY_EXT: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.json': 'json',
  '.jsonc': 'json',
  '.json5': 'json',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.html': 'html',
  '.htm': 'html',
  '.vue': 'html',
  '.svelte': 'html',
  '.astro': 'html',
  '.xml': 'xml',
  '.svg': 'xml',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.mdx': 'mdx',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.toml': 'ini',
  '.ini': 'ini',
  '.cfg': 'ini',
  '.conf': 'ini',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.fish': 'shell',
  '.sql': 'sql',
  '.py': 'python',
  '.pyi': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.rb': 'ruby',
  '.php': 'php',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.swift': 'swift',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.lua': 'lua',
  '.r': 'r',
  '.dart': 'dart',
  '.ps1': 'powershell',
  '.proto': 'protobuf',
  '.tf': 'hcl',
  '.hcl': 'hcl',
  '.txt': 'plaintext'
}

/** Filename (no extension, or special) → language. */
const BY_NAME: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'plaintext',
  '.gitignore': 'plaintext',
  '.prettierrc': 'json',
  '.eslintrc': 'json',
  '.babelrc': 'json',
  'tsconfig.json': 'json',
  '.zshrc': 'shell',
  '.bashrc': 'shell',
  '.bash_profile': 'shell',
  '.zprofile': 'shell'
}

/** Map a file path to a Monaco language id (plaintext when unknown). */
export function languageForPath(path: string): string {
  if (isDotenv(path)) return 'dotenv'
  const base = basename(path).toLowerCase()
  if (BY_NAME[base]) return BY_NAME[base]
  if (base.startsWith('dockerfile.')) return 'dockerfile'
  return BY_EXT[extname(path).toLowerCase()] ?? 'plaintext'
}
