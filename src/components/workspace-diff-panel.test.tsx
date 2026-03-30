import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { WorkspaceDiffPanel } from './workspace-diff-panel'
import type { FilePreview } from '../lib/contracts'

const textPreview: FilePreview = {
  gitStatus: ' ',
  imageDataUrl: null,
  lines: [
    {
      content: 'const mood = "warm"',
      kind: 'context',
      newLineNumber: 1,
      oldLineNumber: 1,
    },
  ],
  liveStatus: 'idle',
  mode: 'text',
  path: 'src/App.tsx',
  startLine: 0,
  totalLines: 1,
}

const markdownPreview: FilePreview = {
  gitStatus: ' ',
  imageDataUrl: null,
  lines: [
    {
      content: '# Flowterm',
      kind: 'context',
      newLineNumber: 1,
      oldLineNumber: 1,
    },
    {
      content: '',
      kind: 'context',
      newLineNumber: 2,
      oldLineNumber: 2,
    },
    {
      content: 'Markdown preview should use the full panel width.',
      kind: 'context',
      newLineNumber: 3,
      oldLineNumber: 3,
    },
  ],
  liveStatus: 'idle',
  mode: 'text',
  path: 'README.md',
  startLine: 0,
  totalLines: 3,
}

const largeDiffPreview: FilePreview = {
  gitStatus: 'M',
  imageDataUrl: null,
  lines: Array.from({ length: 120 }, (_, index) => ({
    content: `diff row ${index + 1}`,
    kind: 'context' as const,
    newLineNumber: index + 1,
    oldLineNumber: index + 1,
  })),
  liveStatus: 'modified',
  mode: 'diff',
  path: 'src/large.ts',
  startLine: 0,
  totalLines: 120,
}

describe('WorkspaceDiffPanel', () => {
  it('shows a detected language badge for code previews', () => {
    render(
      <WorkspaceDiffPanel
        isLoading={false}
        onRequestWindow={vi.fn()}
        preview={textPreview}
        selectedFilePath={textPreview.path}
        syntaxThemeId="flowterm-warm-dark"
      />,
    )

    expect(screen.getByText('TypeScript React')).toBeInTheDocument()
  })

  it('copies the preview path when the synced status icon is pressed', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)

    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    render(
      <WorkspaceDiffPanel
        isLoading={false}
        onRequestWindow={vi.fn()}
        preview={textPreview}
        selectedFilePath={textPreview.path}
        syntaxThemeId="flowterm-warm-dark"
      />,
    )

    await user.click(screen.getByRole('button', { name: '复制相对路径' }))

    expect(writeText).toHaveBeenCalledWith(textPreview.path)
  })

  it('renders markdown previews with the full-width prose layout', () => {
    render(
      <WorkspaceDiffPanel
        isLoading={false}
        onRequestWindow={vi.fn()}
        preview={markdownPreview}
        selectedFilePath={markdownPreview.path}
        syntaxThemeId="flowterm-warm-dark"
      />,
    )

    expect(screen.getByText('Flowterm').closest('.md-prose')).toHaveClass('md-prose--full-width')
  })

  it('renders only the initial visible slice for large diff previews', () => {
    render(
      <WorkspaceDiffPanel
        isLoading={false}
        onRequestWindow={vi.fn()}
        preview={largeDiffPreview}
        selectedFilePath={largeDiffPreview.path}
        syntaxThemeId="flowterm-warm-dark"
      />,
    )

    expect(screen.getByText('diff row 1')).toBeInTheDocument()
    expect(screen.getByText('diff row 72')).toBeInTheDocument()
    expect(screen.queryByText('diff row 73')).not.toBeInTheDocument()
    expect(screen.queryByText('diff row 120')).not.toBeInTheDocument()
  })
})
