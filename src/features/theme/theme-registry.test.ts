import { describe, expect, it } from 'vitest'

import {
  getThemeById,
  listThemes,
  resolveThemeCssVariables,
} from './theme-registry'

describe('theme registry', () => {
  it('exposes the bundled warm and GitHub themes', () => {
    expect(listThemes().map((theme) => theme.id)).toEqual([
      'flowterm-warm-dark',
      'github-dark-default',
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
})
