import type { CSSProperties } from 'react'

export interface PreviewSyntax {
  isMarkdown: boolean
  isPlainText: boolean
  label: string
  language: string
}

const PLAIN_TEXT_SYNTAX: PreviewSyntax = {
  isMarkdown: false,
  isPlainText: true,
  label: 'Plain Text',
  language: 'text',
}

const exactFileMap = new Map<string, PreviewSyntax>([
  ['dockerfile', createSyntax('docker', 'Dockerfile')],
  ['makefile', createSyntax('makefile', 'Makefile')],
  ['readme', createSyntax('markdown', 'Markdown', { isMarkdown: true })],
  ['readme.md', createSyntax('markdown', 'Markdown', { isMarkdown: true })],
  ['readme.mdx', createSyntax('markdown', 'Markdown', { isMarkdown: true })],
  ['.editorconfig', createSyntax('ini', 'EditorConfig')],
  ['.gitignore', createSyntax('ignore', 'Git Ignore')],
])

const extensionMap = new Map<string, PreviewSyntax>([
  ['bash', createSyntax('bash', 'Shell')],
  ['c', createSyntax('c', 'C')],
  ['cc', createSyntax('cpp', 'C++')],
  ['cpp', createSyntax('cpp', 'C++')],
  ['css', createSyntax('css', 'CSS')],
  ['csv', createSyntax('csv', 'CSV')],
  ['cxx', createSyntax('cpp', 'C++')],
  ['go', createSyntax('go', 'Go')],
  ['h', createSyntax('c', 'C Header')],
  ['hpp', createSyntax('cpp', 'C++ Header')],
  ['html', createSyntax('markup', 'HTML')],
  ['ini', createSyntax('ini', 'INI')],
  ['java', createSyntax('java', 'Java')],
  ['js', createSyntax('javascript', 'JavaScript')],
  ['json', createSyntax('json', 'JSON')],
  ['jsx', createSyntax('jsx', 'React JSX')],
  ['kt', createSyntax('kotlin', 'Kotlin')],
  ['kts', createSyntax('kotlin', 'Kotlin')],
  ['less', createSyntax('less', 'Less')],
  ['log', PLAIN_TEXT_SYNTAX],
  ['md', createSyntax('markdown', 'Markdown', { isMarkdown: true })],
  ['mdx', createSyntax('markdown', 'Markdown', { isMarkdown: true })],
  ['mjs', createSyntax('javascript', 'JavaScript')],
  ['py', createSyntax('python', 'Python')],
  ['rb', createSyntax('ruby', 'Ruby')],
  ['rs', createSyntax('rust', 'Rust')],
  ['scss', createSyntax('scss', 'SCSS')],
  ['sh', createSyntax('bash', 'Shell')],
  ['sql', createSyntax('sql', 'SQL')],
  ['svg', createSyntax('markup', 'SVG')],
  ['swift', createSyntax('swift', 'Swift')],
  ['toml', createSyntax('toml', 'TOML')],
  ['ts', createSyntax('typescript', 'TypeScript')],
  ['tsx', createSyntax('tsx', 'TypeScript React')],
  ['txt', PLAIN_TEXT_SYNTAX],
  ['xml', createSyntax('markup', 'XML')],
  ['yaml', createSyntax('yaml', 'YAML')],
  ['yml', createSyntax('yaml', 'YAML')],
  ['zsh', createSyntax('bash', 'Shell')],
])

const languageAliasMap = new Map<string, PreviewSyntax>([
  ['bash', createSyntax('bash', 'Shell')],
  ['c', createSyntax('c', 'C')],
  ['cpp', createSyntax('cpp', 'C++')],
  ['css', createSyntax('css', 'CSS')],
  ['docker', createSyntax('docker', 'Docker')],
  ['go', createSyntax('go', 'Go')],
  ['html', createSyntax('markup', 'HTML')],
  ['ini', createSyntax('ini', 'INI')],
  ['java', createSyntax('java', 'Java')],
  ['javascript', createSyntax('javascript', 'JavaScript')],
  ['js', createSyntax('javascript', 'JavaScript')],
  ['json', createSyntax('json', 'JSON')],
  ['jsx', createSyntax('jsx', 'React JSX')],
  ['kotlin', createSyntax('kotlin', 'Kotlin')],
  ['markdown', createSyntax('markdown', 'Markdown', { isMarkdown: true })],
  ['md', createSyntax('markdown', 'Markdown', { isMarkdown: true })],
  ['python', createSyntax('python', 'Python')],
  ['py', createSyntax('python', 'Python')],
  ['rust', createSyntax('rust', 'Rust')],
  ['scss', createSyntax('scss', 'SCSS')],
  ['shell', createSyntax('bash', 'Shell')],
  ['sql', createSyntax('sql', 'SQL')],
  ['swift', createSyntax('swift', 'Swift')],
  ['toml', createSyntax('toml', 'TOML')],
  ['tsx', createSyntax('tsx', 'TypeScript React')],
  ['ts', createSyntax('typescript', 'TypeScript')],
  ['typescript', createSyntax('typescript', 'TypeScript')],
  ['xml', createSyntax('markup', 'XML')],
  ['yaml', createSyntax('yaml', 'YAML')],
  ['yml', createSyntax('yaml', 'YAML')],
])

export const warmSyntaxTheme: Record<string, CSSProperties> = {
  'code[class*="language-"]': {
    background: 'transparent',
    color: '#e8e3dc',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    fontWeight: '400',
    hyphens: 'none',
    lineHeight: '1.85',
    tabSize: 2,
    textShadow: 'none',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    wordSpacing: 'normal',
  },
  'pre[class*="language-"]': {
    background: 'transparent',
    color: '#e8e3dc',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    lineHeight: '1.85',
    margin: '0',
    overflow: 'visible',
    padding: '0',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  'pre > code[class*="language-"]': {
    fontSize: '1em',
  },
  comment: {
    color: '#7d756d',
    fontStyle: 'italic',
  },
  builtin: {
    color: '#7bb7c9',
  },
  className: {
    color: '#7bb7c9',
  },
  constant: {
    color: '#d7c3a0',
  },
  entity: {
    color: '#9cc7a5',
  },
  function: {
    color: '#7bb7c9',
  },
  keyword: {
    color: '#d9b36c',
  },
  operator: {
    color: '#d9b36c',
  },
  number: {
    color: '#d7c3a0',
  },
  property: {
    color: '#e8e3dc',
  },
  punctuation: {
    color: '#968b81',
  },
  regex: {
    color: '#d7c3a0',
  },
  string: {
    color: '#9cc7a5',
  },
  tag: {
    color: '#7bb7c9',
  },
  variable: {
    color: '#e8e3dc',
  },
}

export function resolvePreviewSyntax(path: string): PreviewSyntax {
  const normalizedPath = path.toLowerCase()
  const basename = normalizedPath.split('/').pop() ?? normalizedPath

  if (basename.startsWith('.env')) {
    return createSyntax('bash', 'Dotenv')
  }

  const exactMatch = exactFileMap.get(basename)

  if (exactMatch) {
    return exactMatch
  }

  const extension = basename.includes('.') ? basename.split('.').pop() : ''
  const extensionMatch = extension ? extensionMap.get(extension) : null

  return extensionMatch ?? PLAIN_TEXT_SYNTAX
}

export function resolveCodeFenceSyntax(languageHint: string | null | undefined): PreviewSyntax {
  if (!languageHint) {
    return PLAIN_TEXT_SYNTAX
  }

  return languageAliasMap.get(languageHint.toLowerCase()) ?? PLAIN_TEXT_SYNTAX
}

function createSyntax(
  language: string,
  label: string,
  options?: {
    isMarkdown?: boolean
  },
): PreviewSyntax {
  return {
    isMarkdown: options?.isMarkdown ?? false,
    isPlainText: language === 'text',
    label,
    language,
  }
}
