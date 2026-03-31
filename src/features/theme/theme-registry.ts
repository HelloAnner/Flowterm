import type { CSSProperties } from 'react'

import catppuccinLatteData from '../../themes/catppuccin-latte.json'
import catppuccinMochaData from '../../themes/catppuccin-mocha.json'
import cursorDarkData from '../../themes/cursor-dark.json'
import draculaData from '../../themes/dracula.json'
import flowtermWarmDarkData from '../../themes/flowterm-warm-dark.json'
import ghosttyDarkData from '../../themes/ghostty-dark.json'
import githubDarkDefaultData from '../../themes/github-dark-default.json'
import intellijLightData from '../../themes/intellij-light.json'
import nightOwlData from '../../themes/night-owl.json'
import nordData from '../../themes/nord.json'
import oneDarkProData from '../../themes/one-dark-pro.json'
import tokyoNightData from '../../themes/tokyo-night.json'

export interface TerminalPalette {
  background: string
  cursor: string
  foreground: string
}

export interface SyntaxPalette {
  builtin: string
  className: string
  comment: string
  constant: string
  entity: string
  function: string
  keyword: string
  number: string
  operator: string
  property: string
  punctuation: string
  regex: string
  string: string
  tag: string
  text: string
  variable: string
}

export interface AppTheme {
  colorScheme: 'dark' | 'light'
  id: string
  label: string
  syntax: SyntaxPalette
  terminal: TerminalPalette
  ui: Record<string, string>
}

type ThemeJsonPayload = Omit<AppTheme, 'colorScheme'> & {
  colorScheme: string
}

const themes = [
  normalizeTheme(flowtermWarmDarkData),
  normalizeTheme(cursorDarkData),
  normalizeTheme(ghosttyDarkData),
  normalizeTheme(githubDarkDefaultData),
  normalizeTheme(tokyoNightData),
  normalizeTheme(nightOwlData),
  normalizeTheme(nordData),
  normalizeTheme(oneDarkProData),
  normalizeTheme(catppuccinMochaData),
  normalizeTheme(draculaData),
  normalizeTheme(intellijLightData),
  normalizeTheme(catppuccinLatteData),
]

export const DEFAULT_THEME_ID = 'flowterm-warm-dark'
export const THEME_STORAGE_KEY = 'flowterm.active-theme'

export function listThemes(): AppTheme[] {
  return themes
}

export function getThemeById(themeId: string): AppTheme {
  return themes.find((theme) => theme.id === themeId) ?? themes[0]
}

export function resolveThemeCssVariables(theme: AppTheme): Record<string, string> {
  return {
    ...Object.fromEntries(
      Object.entries(theme.ui).map(([token, value]) => [`--${token}`, value]),
    ),
    ...resolveDerivedThemeCssVariables(theme),
  }
}

export function createSyntaxHighlightTheme(theme: AppTheme): Record<string, CSSProperties> {
  return {
    'code[class*="language-"]': {
      background: 'transparent',
      color: theme.syntax.text,
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
      color: theme.syntax.text,
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
    builtin: { color: theme.syntax.builtin },
    className: { color: theme.syntax.className },
    comment: { color: theme.syntax.comment, fontStyle: 'italic' },
    constant: { color: theme.syntax.constant },
    entity: { color: theme.syntax.entity },
    function: { color: theme.syntax.function },
    keyword: { color: theme.syntax.keyword },
    number: { color: theme.syntax.number },
    operator: { color: theme.syntax.operator },
    property: { color: theme.syntax.property },
    punctuation: { color: theme.syntax.punctuation },
    regex: { color: theme.syntax.regex },
    string: { color: theme.syntax.string },
    tag: { color: theme.syntax.tag },
    variable: { color: theme.syntax.variable },
  }
}

export function applyThemeToDocument(theme: AppTheme, root?: HTMLElement): void {
  const target = root ?? document.documentElement

  target.dataset.theme = theme.id
  target.style.colorScheme = theme.colorScheme

  for (const [token, value] of Object.entries(resolveThemeCssVariables(theme))) {
    target.style.setProperty(token, value)
  }
}

export function readStoredThemeId(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_THEME_ID
  }

  const storedThemeId = window.localStorage.getItem(THEME_STORAGE_KEY)

  return storedThemeId && themes.some((theme) => theme.id === storedThemeId)
    ? storedThemeId
    : DEFAULT_THEME_ID
}

export function storeThemeId(themeId: string): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(THEME_STORAGE_KEY, getThemeById(themeId).id)
}

function normalizeTheme(payload: ThemeJsonPayload): AppTheme {
  return {
    ...payload,
    colorScheme: payload.colorScheme === 'light' ? 'light' : 'dark',
  }
}

function resolveDerivedThemeCssVariables(theme: AppTheme): Record<string, string> {
  const isLight = theme.colorScheme === 'light'

  return {
    '--rail-active-bg': theme.ui['sidebar-active-bg'] ?? theme.ui['interactive-hover'] ?? 'transparent',
    '--rail-active-border': theme.ui['sidebar-active-border'] ?? theme.ui['border-default'] ?? 'transparent',
    '--rail-bg': theme.ui['bg-elevated'] ?? theme.terminal.background,
    '--rail-hover-bg': isLight ? 'rgba(15, 23, 42, 0.04)' : 'rgba(255, 255, 255, 0.03)',
    '--terminal-depth-shadow': isLight ? 'rgba(15, 23, 42, 0.03)' : 'rgba(0, 0, 0, 0.2)',
    '--terminal-toolbar-bg': theme.ui['bg-elevated'] ?? theme.terminal.background,
    '--terminal-pane-bg': theme.ui['terminal-bg'] ?? theme.terminal.background,
    '--terminal-tint-primary': theme.ui['ambient-primary'] ?? 'transparent',
    '--terminal-tint-secondary': theme.ui['ambient-secondary'] ?? 'transparent',
    '--terminal-glass-bg': isLight ? 'rgba(15, 23, 42, 0.04)' : 'rgba(255, 255, 255, 0.03)',
    '--terminal-glass-strong': isLight ? 'rgba(15, 23, 42, 0.06)' : 'rgba(255, 255, 255, 0.05)',
  }
}
