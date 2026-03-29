import { describe, expect, it } from 'vitest'

import {
  resolvePreviewSyntax,
  warmSyntaxTheme,
} from './preview-syntax'

describe('resolvePreviewSyntax', () => {
  it('maps common code and config files to the right preview language', () => {
    expect(resolvePreviewSyntax('src/App.tsx')).toMatchObject({
      isMarkdown: false,
      isPlainText: false,
      label: 'TypeScript React',
      language: 'tsx',
    })

    expect(resolvePreviewSyntax('package.json')).toMatchObject({
      isMarkdown: false,
      isPlainText: false,
      label: 'JSON',
      language: 'json',
    })

    expect(resolvePreviewSyntax('scripts/setup.sh')).toMatchObject({
      isMarkdown: false,
      isPlainText: false,
      label: 'Shell',
      language: 'bash',
    })

    expect(resolvePreviewSyntax('README.md')).toMatchObject({
      isMarkdown: true,
      isPlainText: false,
      label: 'Markdown',
      language: 'markdown',
    })
  })

  it('falls back to plain text for unknown file types', () => {
    expect(resolvePreviewSyntax('notes/ambient.story')).toMatchObject({
      isMarkdown: false,
      isPlainText: true,
      label: 'Plain Text',
      language: 'text',
    })
  })
})

describe('warmSyntaxTheme', () => {
  it('keeps the preview palette warm and legible', () => {
    expect(warmSyntaxTheme.keyword?.color).toBe('#d9b36c')
    expect(warmSyntaxTheme.string?.color).toBe('#9cc7a5')
    expect(warmSyntaxTheme.comment?.color).toBe('#7d756d')
    expect(
      warmSyntaxTheme['pre[class*="language-"]']?.background,
    ).toBe('transparent')
  })
})
