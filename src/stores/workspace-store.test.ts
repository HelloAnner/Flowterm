import { waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppBootstrap, FilePreview } from '../lib/contracts'

const {
  attachTerminalMock,
  bootstrapAppMock,
  isTauriEnvironmentMock,
  listTerminalsMock,
  readFilePreviewMock,
  readProjectWorkspaceMock,
  saveProjectWorkspaceMock,
} = vi.hoisted(() => ({
  attachTerminalMock: vi.fn(),
  bootstrapAppMock: vi.fn(),
  isTauriEnvironmentMock: vi.fn(),
  listTerminalsMock: vi.fn(),
  readFilePreviewMock: vi.fn(),
  readProjectWorkspaceMock: vi.fn(),
  saveProjectWorkspaceMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}))

vi.mock('../lib/tauri', () => ({
  activateProject: vi.fn(),
  addProject: vi.fn(),
  attachTerminal: attachTerminalMock,
  bootstrapApp: bootstrapAppMock,
  closeTerminal: vi.fn(),
  isTauriEnvironment: isTauriEnvironmentMock,
  listTerminals: listTerminalsMock,
  readFilePreview: readFilePreviewMock,
  readProjectWorkspace: readProjectWorkspaceMock,
  refreshProjectSnapshot: vi.fn(),
  removeProject: vi.fn(),
  resizeTerminal: vi.fn(),
  saveProjectWorkspace: saveProjectWorkspaceMock,
  writeTerminal: vi.fn(),
}))

import { useWorkspaceStore } from './workspace-store'

const bootstrapPayload: AppBootstrap = {
  activeProjectId: 'project-a',
  projects: [
    {
      changedFileCount: 1,
      hasLiveActivity: false,
      id: 'project-a',
      name: 'Flowterm',
      path: '/tmp/flowterm',
      terminalState: 'idle',
      untrackedFileCount: 0,
    },
  ],
  snapshot: {
    backend: 'xterm',
    files: [
      {
        gitStatus: 'M',
        kind: 'file',
        liveStatus: 'modified',
        path: 'src/App.tsx',
      },
    ],
    project: {
      changedFileCount: 1,
      hasLiveActivity: false,
      id: 'project-a',
      name: 'Flowterm',
      path: '/tmp/flowterm',
      terminalState: 'idle',
      untrackedFileCount: 0,
    },
  },
  terminals: [],
  workspaceState: null,
}

function resetWorkspaceState(): void {
  useWorkspaceStore.setState({
    activeProjectId: null,
    draftName: '',
    draftPath: '',
    error: null,
    filePreview: null,
    isBooting: true,
    isFilePreviewLoading: false,
    isProjectDialogOpen: false,
    previewRequestId: 0,
    projects: [],
    selectedFilePath: null,
    snapshot: null,
    terminalProjectStateByProject: {},
    workspaceStateByProject: {},
  })
}

describe('workspace store bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetWorkspaceState()
    bootstrapAppMock.mockResolvedValue(bootstrapPayload)
    isTauriEnvironmentMock.mockReturnValue(true)
    listTerminalsMock.mockResolvedValue([])
    readProjectWorkspaceMock.mockResolvedValue({
      selectedFilePath: null,
      terminalPaneSizes: [],
      treeExpandedPaths: {},
    })
    saveProjectWorkspaceMock.mockResolvedValue(undefined)
  })

  it('resolves bootstrap after shell state is applied while hydration continues in background', async () => {
    readFilePreviewMock.mockReturnValue(new Promise<FilePreview>(() => {}))

    const bootstrapPromise = useWorkspaceStore.getState().bootstrap()

    await waitFor(() => {
      expect(useWorkspaceStore.getState().isBooting).toBe(false)
    })

    expect(useWorkspaceStore.getState().selectedFilePath).toBe('src/App.tsx')
    expect(attachTerminalMock).not.toHaveBeenCalled()
    expect(readFilePreviewMock).toHaveBeenCalledWith('project-a', 'src/App.tsx', {
      lineCount: 200,
      startLine: 0,
    })

    const bootstrapStatus = await Promise.race([
      bootstrapPromise.then(() => 'resolved'),
      new Promise<'pending'>((resolve) => {
        setTimeout(() => resolve('pending'), 0)
      }),
    ])

    expect(bootstrapStatus).toBe('resolved')
  })
})
