import { describe, expect, it } from 'vitest'

import {
  getThemeById,
  listThemes,
  resolveThemeCssVariables,
} from './theme-registry'

describe('theme registry', () => {
  it('exposes the bundled editor-style themes', () => {
    expect(listThemes().map((theme) => theme.id)).toEqual([
      'flowterm-warm-dark',
      'cursor-dark',
      'ghostty-dark',
      'github-dark-default',
      'tokyo-night',
      'night-owl',
      'nord',
      'one-dark-pro',
      'catppuccin-mocha',
      'dracula',
      'intellij-light',
      'catppuccin-latte',
    ])
  })

  it('resolves GitHub Dark Default from JSON-backed tokens', () => {
    const theme = getThemeById('github-dark-default')

    expect(theme.label).toBe('GitHub Dark Default')
    expect(theme.colorScheme).toBe('dark')
    expect(theme.terminal.background).toBe('#0d1117')
    expect(theme.syntax.keyword).toBe('#ff7b72')
    expect(theme.syntax.string).toBe('#a5d6ff')

    expect(resolveThemeCssVariables(theme)).toMatchObject({
      '--accent-amber': '#2f81f7',
      '--bg-base': '#0d1117',
      '--bg-elevated': '#161b22',
      '--border-subtle': '#30363d',
      '--terminal-bg': '#0d1117',
      '--text-primary': '#e6edf3',
    })
  })

  it('resolves Cursor and Ghostty palettes from bundled theme packs', () => {
    const cursorTheme = getThemeById('cursor-dark')
    const ghosttyTheme = getThemeById('ghostty-dark')

    expect(cursorTheme.label).toBe('Cursor Dark')
    expect(cursorTheme.terminal.cursor).toBe('#60a5fa')
    expect(cursorTheme.syntax.keyword).toBe('#c084fc')
    expect(resolveThemeCssVariables(cursorTheme)).toMatchObject({
      '--bg-base': '#18181b',
      '--text-primary': '#fafafa',
      '--sidebar-active-bg': 'rgba(96, 165, 250, 0.1)',
    })

    expect(ghosttyTheme.label).toBe('Ghostty Dark')
    expect(ghosttyTheme.terminal.background).toBe('#0d0d0d')
    expect(ghosttyTheme.syntax.string).toBe('#4ade80')
    expect(resolveThemeCssVariables(ghosttyTheme)).toMatchObject({
      '--bg-base': '#0d0d0d',
      '--accent-glow': '#38bdf8',
      '--terminal-divider-strong': '#1f1f1f',
    })
  })

  it('resolves Tokyo Night, Night Owl, and Nord theme packs', () => {
    const tokyoNightTheme = getThemeById('tokyo-night')
    const nightOwlTheme = getThemeById('night-owl')
    const nordTheme = getThemeById('nord')

    expect(tokyoNightTheme.label).toBe('Tokyo Night')
    expect(tokyoNightTheme.terminal.background).toBe('#1a1b26')
    expect(tokyoNightTheme.syntax.keyword).toBe('#bb9af7')

    expect(nightOwlTheme.label).toBe('Night Owl')
    expect(nightOwlTheme.terminal.cursor).toBe('#7fdbca')
    expect(nightOwlTheme.syntax.string).toBe('#ecc48d')

    expect(nordTheme.label).toBe('Nord')
    expect(nordTheme.colorScheme).toBe('dark')
    expect(resolveThemeCssVariables(nordTheme)).toMatchObject({
      '--bg-base': '#2e3440',
      '--text-primary': '#eceff4',
      '--accent-glow': '#88c0d0',
    })
  })
})
