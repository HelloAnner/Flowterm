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

describe('WorkspaceDiffPanel', () => {
  it('shows a detected language badge for code previews', () => {
    render(
      <WorkspaceDiffPanel
        isLoading={false}
        onRequestWindow={vi.fn()}
        preview={textPreview}
        selectedFilePath={textPreview.path}
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
      />,
    )

    await user.click(screen.getByRole('button', { name: '复制相对路径' }))

    expect(writeText).toHaveBeenCalledWith(textPreview.path)
  })
})
