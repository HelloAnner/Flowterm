import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { WorkspaceFileTree } from './workspace-file-tree'
import type { ProjectFileEntry } from '../lib/contracts'

const files: ProjectFileEntry[] = [
  {
    path: 'README.md',
    kind: 'file',
    gitStatus: ' ',
    liveStatus: 'idle',
  },
  {
    path: 'package.json',
    kind: 'file',
    gitStatus: ' ',
    liveStatus: 'idle',
  },
  {
    path: 'src/App.tsx',
    kind: 'file',
    gitStatus: 'M',
    liveStatus: 'modified',
  },
  {
    path: 'assets/logo.png',
    kind: 'file',
    gitStatus: ' ',
    liveStatus: 'idle',
  },
]

describe('WorkspaceFileTree', () => {
  it('keeps folders collapsed by default', () => {
    render(
      <WorkspaceFileTree
        expandedPaths={{}}
        files={files}
        onToggleFolder={vi.fn()}
        onSelectFile={vi.fn()}
        selectedFilePath={null}
      />,
    )

    expect(screen.getByRole('button', { name: /src/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /App\.tsx/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /logo\.png/i })).not.toBeInTheDocument()
  })

  it('renders distinct icons for common file types', () => {
    render(
      <WorkspaceFileTree
        expandedPaths={{
          assets: true,
          src: true,
        }}
        files={files}
        onToggleFolder={vi.fn()}
        onSelectFile={vi.fn()}
        selectedFilePath={null}
      />,
    )

    const readmeRow = screen.getByRole('button', { name: /README\.md/i })
    const packageRow = screen.getByRole('button', { name: /package\.json/i })
    const sourceRow = screen.getByRole('button', { name: /App\.tsx/i })
    const imageRow = screen.getByRole('button', { name: /logo\.png/i })

    expect(readmeRow.querySelector('[data-file-icon="markdown"]')).toBeInTheDocument()
    expect(packageRow.querySelector('[data-file-icon="json"]')).toBeInTheDocument()
    expect(sourceRow.querySelector('[data-file-icon="code"]')).toBeInTheDocument()
    expect(imageRow.querySelector('[data-file-icon="image"]')).toBeInTheDocument()
  })
})
