import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

const unifiedDiffPreview: FilePreview = {
  gitStatus: 'M',
  imageDataUrl: null,
  lines: [
    {
      content: 'const previous = true',
      kind: 'removed',
      newLineNumber: null,
      oldLineNumber: 8,
    },
    {
      content: 'const next = true',
      kind: 'added',
      newLineNumber: 8,
      oldLineNumber: null,
    },
    {
      content: 'const stable = true',
      kind: 'context',
      newLineNumber: 9,
      oldLineNumber: 9,
    },
  ],
  liveStatus: 'modified',
  mode: 'diff',
  path: 'src/lib/dev-runtime.test.ts',
  startLine: 0,
  totalLines: 3,
}

describe('WorkspaceDiffPanel', () => {
  it('keeps the current file path visible in the header', () => {
    render(
      <WorkspaceDiffPanel
        isLoading={false}
        onRequestWindow={vi.fn()}
        preview={textPreview}
        selectedFilePath={textPreview.path}
        syntaxThemeId="flowterm-warm-dark"
      />,
    )

    expect(screen.getByText('src/App.tsx')).toBeInTheDocument()
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

  it('renders markdown in an editor surface instead of the generic code grid', () => {
    const { container } = render(
      <WorkspaceDiffPanel
        isLoading={false}
        onRequestWindow={vi.fn()}
        preview={markdownPreview}
        selectedFilePath={markdownPreview.path}
        syntaxThemeId="flowterm-warm-dark"
      />,
    )

    expect(screen.getByRole('textbox', { name: 'Markdown 编辑器' })).toBeInTheDocument()
    expect(container.querySelector('[class*="grid-cols"]')).toBeNull()
  })

  it('lets markdown files edit, select all with command+a, and copy raw markdown text', async () => {
    const user = userEvent.setup()

    render(
      <WorkspaceDiffPanel
        isLoading={false}
        onRequestWindow={vi.fn()}
        preview={markdownPreview}
        selectedFilePath={markdownPreview.path}
        syntaxThemeId="flowterm-warm-dark"
      />,
    )

    const editor = screen.getByRole('textbox', { name: 'Markdown 编辑器' }) as HTMLTextAreaElement
    editor.focus()

    fireEvent.keyDown(editor, {
      key: 'a',
      metaKey: true,
    })

    expect(editor.selectionStart).toBe(0)
    expect(editor.selectionEnd).toBe(editor.value.length)

    editor.setSelectionRange(0, '# Flowterm'.length)

    const clipboardData = {
      setData: vi.fn(),
    }

    fireEvent.copy(editor, { clipboardData })

    expect(clipboardData.setData).toHaveBeenCalledWith('text/plain', '# Flowterm')

    await user.type(editor, '\n\n- edited')

    expect(editor.value).toContain('- edited')
  })

  it('auto-saves markdown edits after a debounce delay', async () => {
    const onSaveMarkdown = vi.fn().mockResolvedValue(undefined)

    render(
      <WorkspaceDiffPanel
        isLoading={false}
        onRequestWindow={vi.fn()}
        onSaveMarkdown={onSaveMarkdown}
        preview={markdownPreview}
        selectedFilePath={markdownPreview.path}
        syntaxThemeId="flowterm-warm-dark"
      />,
    )

    const editor = screen.getByRole('textbox', { name: 'Markdown 编辑器' })

    fireEvent.change(editor, { target: { value: '# Flowterm\n\n- saved' } })

    // Should not save immediately
    expect(onSaveMarkdown).not.toHaveBeenCalled()

    // Wait for debounce to flush
    await waitFor(
      () => {
        expect(onSaveMarkdown).toHaveBeenCalledWith(
          markdownPreview.path,
          expect.stringContaining('- saved'),
        )
      },
      { timeout: 2000 },
    )
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

  it('uses a single unified diff gutter with status markers instead of dual line-number columns', () => {
    render(
      <WorkspaceDiffPanel
        isLoading={false}
        onRequestWindow={vi.fn()}
        preview={unifiedDiffPreview}
        selectedFilePath={unifiedDiffPreview.path}
        syntaxThemeId="flowterm-warm-dark"
      />,
    )

    const gutters = screen.getAllByTestId('diff-gutter')
    expect(gutters).toHaveLength(3)
    expect(gutters[0]).toHaveTextContent('-8')
    expect(gutters[1]).toHaveTextContent('+8')
    expect(gutters[2]).toHaveTextContent('9')
    expect(screen.queryByTestId('legacy-old-line-number')).not.toBeInTheDocument()
    expect(screen.queryByTestId('legacy-new-line-number')).not.toBeInTheDocument()
  })

  it('hides preview chrome text and keeps only icon signals in the header', () => {
    const { container } = render(
      <WorkspaceDiffPanel
        isLoading={false}
        onRequestWindow={vi.fn()}
        preview={textPreview}
        selectedFilePath={textPreview.path}
        syntaxThemeId="flowterm-warm-dark"
      />,
    )

    expect(container.firstChild?.firstChild).toHaveClass('h-8', 'px-3')
    expect(screen.queryByText('工作区预览')).not.toBeInTheDocument()
    expect(screen.queryByText('TypeScript React')).not.toBeInTheDocument()
  })
})
