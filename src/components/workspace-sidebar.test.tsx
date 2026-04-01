import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { WorkspaceSidebar } from './workspace-sidebar'
import type { ProjectFileEntry } from '../lib/contracts'

const files: ProjectFileEntry[] = [
  {
    path: 'src/App.tsx',
    kind: 'file',
    gitStatus: 'M',
    liveStatus: 'modified',
  },
  {
    path: 'src/components/workspace-file-tree.tsx',
    kind: 'file',
    gitStatus: ' ',
    liveStatus: 'idle',
  },
  {
    path: 'README.md',
    kind: 'file',
    gitStatus: '?',
    liveStatus: 'idle',
  },
]

describe('WorkspaceSidebar', () => {
  it('keeps the file totals in accessibility copy but hides the bottom total label', () => {
    render(
      <WorkspaceSidebar
        files={files}
        onSelectView={vi.fn()}
        selectedView="tree"
      >
        <div>tree panel</div>
      </WorkspaceSidebar>,
    )

    const treeButton = screen.getByRole('button', {
      name: '文件树，3 个文件，2 个改动',
    })
    const settingsButton = screen.getByRole('button', {
      name: '设置',
    })

    expect(treeButton).toBeInTheDocument()
    expect(settingsButton).toBeInTheDocument()
    expect(treeButton).toHaveClass('gap-1', 'p-2')
    expect(settingsButton).toHaveClass('mt-auto')
    expect(treeButton).toHaveTextContent('2')
    expect(screen.queryByText('3')).not.toBeInTheDocument()
    expect(screen.getByText('tree panel')).toBeInTheDocument()
  })
})
