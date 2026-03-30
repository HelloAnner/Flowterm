import type { CSSProperties } from 'react'

import {
  createSyntaxHighlightTheme,
  getThemeById,
} from '../theme/theme-registry'

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

export const warmSyntaxTheme: Record<string, CSSProperties> = createSyntaxHighlightTheme(
  getThemeById('flowterm-warm-dark'),
)

export function resolveSyntaxTheme(themeId: string): Record<string, CSSProperties> {
  return createSyntaxHighlightTheme(getThemeById(themeId))
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

export function shouldDelaySyntaxHighlight(syntax: PreviewSyntax): boolean {
  return !syntax.isMarkdown && !syntax.isPlainText
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
