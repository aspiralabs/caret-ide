import { basename, extname } from '../../lib/path'

// True for `.env`, `.env.local`, `.env.production`, `foo.env`, etc. Env files
// need basename matching, not extname: `extname('.env')` is '' (a leading dot is
// the filename, not an extension), and `extname('.env.local')` is '.local'.
function isDotenv(path: string): boolean {
  const base = basename(path).toLowerCase()
  return base === '.env' || base.startsWith('.env.') || base.endsWith('.env')
}

// Map a file extension to a Monaco language id (spec §5.2: TS/JS/TSX/JSON/CSS/MD).
// Monaco uses 'typescript' for both .ts and .tsx.
export function languageForPath(path: string): string {
  if (isDotenv(path)) return 'dotenv'
  switch (extname(path).toLowerCase()) {
    case '.ts':
    case '.tsx':
      return 'typescript'
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return 'javascript'
    case '.json':
      return 'json'
    case '.css':
      return 'css'
    case '.scss':
      return 'scss'
    case '.less':
      return 'less'
    case '.html':
    case '.htm':
      return 'html'
    case '.md':
    case '.markdown':
      return 'markdown'
    default:
      return 'plaintext'
  }
}
