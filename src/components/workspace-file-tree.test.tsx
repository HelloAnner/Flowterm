import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  beforeEach(() => {
    class ResizeObserverMock {
      disconnect(): void {}
      observe(): void {}
      unobserve(): void {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  })

  it('keeps folders collapsed by default', () => {
    render(
      <WorkspaceFileTree
        expandedPaths={{}}
        files={files}
        onCreateEntry={vi.fn().mockResolvedValue(undefined)}
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
        onCreateEntry={vi.fn().mockResolvedValue(undefined)}
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

  it('creates a root file from the explorer header with inline input', async () => {
    const user = userEvent.setup()
    const onCreateEntry = vi.fn().mockResolvedValue(undefined)

    render(
      <WorkspaceFileTree
        expandedPaths={{}}
        files={files}
        onCreateEntry={onCreateEntry}
        onSelectFile={vi.fn()}
        onToggleFolder={vi.fn()}
        selectedFilePath={null}
      />,
    )

    await user.click(screen.getByRole('button', { name: '新建文件' }))

    const input = screen.getByPlaceholderText('New File')

    await user.type(input, 'notes.md')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(onCreateEntry).toHaveBeenCalledWith('notes.md', 'file')
    })
  })

  it('opens a folder before creating a child file from the context menu', async () => {
    const user = userEvent.setup()
    const onCreateEntry = vi.fn().mockResolvedValue(undefined)
    const onToggleFolder = vi.fn()

    render(
      <WorkspaceFileTree
        expandedPaths={{}}
        files={files}
        onCreateEntry={onCreateEntry}
        onSelectFile={vi.fn()}
        onToggleFolder={onToggleFolder}
        selectedFilePath={null}
      />,
    )

    fireEvent.contextMenu(screen.getByRole('button', { name: /src/i }))

    await user.click(screen.getByRole('menuitem', { name: 'New File' }))

    expect(onToggleFolder).toHaveBeenCalledWith('src', true)

    const input = screen.getByPlaceholderText('New File')
    await user.type(input, 'new-pane.tsx')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(onCreateEntry).toHaveBeenCalledWith('src/new-pane.tsx', 'file')
    })
  })

  it('creates beside the current file when the file row context menu starts a new folder', async () => {
    const user = userEvent.setup()
    const onCreateEntry = vi.fn().mockResolvedValue(undefined)

    render(
      <WorkspaceFileTree
        expandedPaths={{
          src: true,
        }}
        files={files}
        onCreateEntry={onCreateEntry}
        onSelectFile={vi.fn()}
        onToggleFolder={vi.fn()}
        selectedFilePath={null}
      />,
    )

    fireEvent.contextMenu(screen.getByRole('button', { name: /App\.tsx/i }))

    await user.click(screen.getByRole('menuitem', { name: 'New Folder' }))

    const input = screen.getByPlaceholderText('New Folder')
    await user.type(input, 'generated')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(onCreateEntry).toHaveBeenCalledWith('src/generated', 'folder')
    })
  })
})
