// Colored, type-specific file icons for the tree (Cursor/VS Code "material" feel).
// Each icon renders at 16x16. Folders use a chevron only (no folder icon), so
// there's no folder icon here — see Chevron below.

import { extname } from '../../lib/path'

type IconProps = { className?: string }

// --- primitives ------------------------------------------------------------

/** Rounded-square badge with short label text (TS, JS, py, …). */
function Badge({
  bg,
  fg = '#ffffff',
  text,
  size = 7
}: {
  bg: string
  fg?: string
  text: string
  size?: number
}): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" fill={bg} />
      <text
        x="8"
        y="8.7"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
        fontWeight="700"
        fontSize={size}
        fill={fg}
      >
        {text}
      </text>
    </svg>
  )
}

/** Text-only glyph (no background), e.g. JSON braces. */
function Glyph({ color, text, size = 9 }: { color: string; text: string; size?: number }): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <text
        x="8"
        y="8.8"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="ui-monospace, monospace"
        fontWeight="700"
        fontSize={size}
        fill={color}
      >
        {text}
      </text>
    </svg>
  )
}

// --- shaped icons ----------------------------------------------------------

function ReactIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="-11.5 -10.23 23 20.46">
      <circle r="2.05" fill="#61dafb" />
      <g stroke="#61dafb" strokeWidth="1" fill="none">
        <ellipse rx="11" ry="4.2" />
        <ellipse rx="11" ry="4.2" transform="rotate(60)" />
        <ellipse rx="11" ry="4.2" transform="rotate(120)" />
      </g>
    </svg>
  )
}

function ImageIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="#26a269" />
      <circle cx="5.2" cy="6" r="1.3" fill="#fff" />
      <path d="M2.5 12.5 L6 8.5 L8.5 11 L11 7.5 L13.5 11.5 L13.5 12.5 Z" fill="#eafff0" />
    </svg>
  )
}

function LockIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <path d="M5 7V5.5a3 3 0 0 1 6 0V7" fill="none" stroke="#c9903a" strokeWidth="1.3" />
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.3" fill="#c9903a" />
      <circle cx="8" cy="10" r="1" fill="#3a2c12" />
    </svg>
  )
}

function GitIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <rect x="1.2" y="1.2" width="13.6" height="13.6" rx="3" fill="#f05133" />
      {/* simplified branch: two nodes + connector */}
      <g fill="#fff">
        <circle cx="5.5" cy="5" r="1.35" />
        <circle cx="5.5" cy="11" r="1.35" />
        <circle cx="10.5" cy="7.2" r="1.35" />
        <path d="M5.1 5h.8v6h-.8z" />
        <path d="M5.7 7.6c2 0 3.4-.4 4.2-1.1l.6.7c-1 .9-2.6 1.3-4.8 1.3z" />
      </g>
    </svg>
  )
}

function DockerIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <g fill="#2496ed">
        <rect x="2.5" y="7" width="2" height="1.9" rx="0.2" />
        <rect x="5" y="7" width="2" height="1.9" rx="0.2" />
        <rect x="7.5" y="7" width="2" height="1.9" rx="0.2" />
        <rect x="5" y="4.6" width="2" height="1.9" rx="0.2" />
        <path d="M1.5 9.3h11c.2 1.9-1.3 3.7-4 3.7H5c-2 0-3.4-1.4-3.5-3.4z" />
      </g>
      <path d="M12 8.4c.3-.6.6-.4.9-.2.2-.5.9-.4 1 .1.4-.2.9 0 .9.5-.7.5-1.8.4-2.8-.4z" fill="#2496ed" />
    </svg>
  )
}

function GearIcon({ color = '#8b949e' }: { color?: string }): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <path
        d="M8 5.4A2.6 2.6 0 1 0 8 10.6 2.6 2.6 0 0 0 8 5.4zm0 1.6A1 1 0 1 1 8 9 1 1 0 0 1 8 7z"
        fill={color}
      />
      <path
        d="M8 1.5l1 .6 1.1-.3.6 1 .9.8-.2 1.1.6 1-.6 1 .2 1.1-.9.8-.6 1-1.1-.3-1 .6-1-.6-1.1.3-.6-1-.9-.8.2-1.1-.6-1 .6-1-.2-1.1.9-.8.6-1L7 2.1z"
        fill="none"
        stroke={color}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function TerminalIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="#3a3d41" />
      <path d="M4 6l2.2 2L4 10" fill="none" stroke="#8ae234" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.8 10.2h3.4" stroke="#c9d1d9" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}

function MarkdownIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <rect x="1" y="3" width="14" height="10" rx="1.6" fill="#42a5f5" />
      <path d="M3 10.5V5.5h1.3L5.6 7.2 6.9 5.5H8.2v5H6.9V7.6L5.6 9.2 4.3 7.6v2.9z" fill="#fff" />
      <path d="M10.6 5.5h1.3v2.8h1.3L11.25 11 9.3 8.3h1.3z" fill="#fff" />
    </svg>
  )
}

function DocIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <path
        d="M4 1.5h5L12.5 5v9a1 1 0 0 1-1 1h-7.5a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1z"
        fill="none"
        stroke="#8b949e"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M9 1.6V5h3.3" fill="none" stroke="#8b949e" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  )
}

// --- resolution ------------------------------------------------------------

type Kind =
  | 'ts' | 'tsx' | 'js' | 'jsx' | 'json' | 'css' | 'scss' | 'less' | 'html'
  | 'md' | 'image' | 'lock' | 'git' | 'docker' | 'config' | 'gear-yellow'
  | 'shell' | 'py' | 'go' | 'rs' | 'rb' | 'java' | 'php' | 'sql' | 'yaml' | 'doc'

function resolveKind(name: string): Kind {
  const lower = name.toLowerCase()

  // Full-name matches first (dotfiles / lockfiles / special names).
  if (lower === 'dockerfile' || lower === '.dockerignore' || lower.startsWith('docker-compose'))
    return 'docker'
  if (lower === '.gitignore' || lower === '.gitattributes' || lower === '.gitmodules') return 'git'
  if (lower.startsWith('.env')) return 'gear-yellow'
  if (
    lower === 'package-lock.json' ||
    lower === 'yarn.lock' ||
    lower === 'pnpm-lock.yaml' ||
    lower.endsWith('.lock')
  )
    return 'lock'
  if (
    lower === '.npmrc' ||
    lower === '.editorconfig' ||
    lower.startsWith('.prettier') ||
    lower.startsWith('.eslint') ||
    lower.startsWith('.babel') ||
    lower.startsWith('.railway') ||
    lower.startsWith('.nvmrc')
  )
    return 'config'

  switch (extname(lower)) {
    case '.ts': return 'ts'
    case '.tsx': return 'tsx'
    case '.js': case '.mjs': case '.cjs': return 'js'
    case '.jsx': return 'jsx'
    case '.json': case '.jsonc': return 'json'
    case '.css': return 'css'
    case '.scss': case '.sass': return 'scss'
    case '.less': return 'less'
    case '.html': case '.htm': return 'html'
    case '.md': case '.mdx': case '.markdown': return 'md'
    case '.png': case '.jpg': case '.jpeg': case '.gif': case '.webp': case '.svg':
    case '.ico': case '.bmp': case '.avif': return 'image'
    case '.yml': case '.yaml': return 'yaml'
    case '.toml': case '.ini': case '.conf': case '.cfg': return 'config'
    case '.sh': case '.bash': case '.zsh': case '.fish': return 'shell'
    case '.py': return 'py'
    case '.go': return 'go'
    case '.rs': return 'rs'
    case '.rb': return 'rb'
    case '.java': case '.kt': return 'java'
    case '.php': return 'php'
    case '.sql': return 'sql'
    default: return 'doc'
  }
}

const RENDER: Record<Kind, () => JSX.Element> = {
  ts: () => <Badge bg="#3178c6" text="TS" />,
  tsx: () => <ReactIcon />,
  js: () => <Badge bg="#f7df1e" fg="#000" text="JS" />,
  jsx: () => <ReactIcon />,
  json: () => <Glyph color="#cbcb41" text="{ }" size={7} />,
  css: () => <Badge bg="#519aba" text="#" size={9} />,
  scss: () => <Badge bg="#cc6699" text="#" size={9} />,
  less: () => <Badge bg="#2a4d80" text="#" size={9} />,
  html: () => <Badge bg="#e34c26" text="<>" size={6} />,
  md: () => <MarkdownIcon />,
  image: () => <ImageIcon />,
  lock: () => <LockIcon />,
  git: () => <GitIcon />,
  docker: () => <DockerIcon />,
  config: () => <GearIcon />,
  'gear-yellow': () => <GearIcon color="#d3b23a" />,
  yaml: () => <GearIcon color="#cb4b4b" />,
  shell: () => <TerminalIcon />,
  py: () => <Badge bg="#3572A5" text="py" size={6} />,
  go: () => <Badge bg="#00ADD8" text="go" size={6} />,
  rs: () => <Badge bg="#dea584" fg="#000" text="rs" size={6} />,
  rb: () => <Badge bg="#cc342d" text="rb" size={6} />,
  java: () => <Badge bg="#e76f00" text="jv" size={6} />,
  php: () => <Badge bg="#777bb4" text="php" size={5} />,
  sql: () => <Badge bg="#dea584" fg="#000" text="sql" size={5} />,
  doc: () => <DocIcon />
}

/** Colored icon element for a file, keyed on its name/extension. */
export function fileIcon(name: string): JSX.Element {
  return RENDER[resolveKind(name)]()
}

/** Rotating disclosure chevron for folders (no folder icon, Cursor-style). */
export function Chevron({ open, className }: { open: boolean } & IconProps): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      className={className}
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.12s ease' }}
    >
      <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
