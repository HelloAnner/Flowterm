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
  refreshProjectSnapshotMock,
  saveProjectWorkspaceMock,
} = vi.hoisted(() => ({
  attachTerminalMock: vi.fn(),
  bootstrapAppMock: vi.fn(),
  isTauriEnvironmentMock: vi.fn(),
  listTerminalsMock: vi.fn(),
  readFilePreviewMock: vi.fn(),
  readProjectWorkspaceMock: vi.fn(),
  refreshProjectSnapshotMock: vi.fn(),
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
  refreshProjectSnapshot: refreshProjectSnapshotMock,
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
    refreshProjectSnapshotMock.mockResolvedValue(bootstrapPayload.snapshot)
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

describe('workspace store terminal panes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetWorkspaceState()
    isTauriEnvironmentMock.mockReturnValue(true)
    saveProjectWorkspaceMock.mockResolvedValue(undefined)
  })

  it('keeps pane sizes aligned with pane count while adding a split', async () => {
    attachTerminalMock.mockResolvedValue({
      agentStatus: {
        agent: 'unknown',
        phase: 'idle',
      },
      cwd: '/tmp/flowterm',
      history: '',
      paneId: 'pane-third',
      projectId: 'project-a',
      sessionId: 'session-third',
      shellLabel: 'zsh',
      state: 'idle',
    })

    useWorkspaceStore.setState({
      terminalProjectStateByProject: {
        'project-a': {
          paneOrder: ['main', 'pane-second'],
          panesById: {
            main: {
              agentStatus: {
                agent: 'unknown',
                phase: 'idle',
              },
              cwd: '/tmp/flowterm',
              history: '',
              paneId: 'main',
              projectId: 'project-a',
              sessionId: 'session-main',
              shellLabel: 'zsh',
              state: 'idle',
            },
            'pane-second': {
              agentStatus: {
                agent: 'unknown',
                phase: 'idle',
              },
              cwd: '/tmp/flowterm',
              history: '',
              paneId: 'pane-second',
              projectId: 'project-a',
              sessionId: 'session-second',
              shellLabel: 'zsh',
              state: 'idle',
            },
          },
        },
      },
      workspaceStateByProject: {
        'project-a': {
          selectedFilePath: null,
          terminalPaneSizes: [50, 50],
          treeExpandedPaths: {},
        },
      },
    })

    const observedSnapshots: Array<{ paneCount: number, sizeCount: number, sizes: number[] }> = []
    const unsubscribe = useWorkspaceStore.subscribe((state) => {
      const projectState = state.terminalProjectStateByProject['project-a']
      const workspaceState = state.workspaceStateByProject['project-a']

      observedSnapshots.push({
        paneCount: projectState?.paneOrder.length ?? 0,
        sizeCount: workspaceState?.terminalPaneSizes.length ?? 0,
        sizes: workspaceState?.terminalPaneSizes ?? [],
      })
    })

    await useWorkspaceStore.getState().addTerminalPane('project-a')
    unsubscribe()

    expect(observedSnapshots).not.toContainEqual({
      paneCount: 3,
      sizeCount: 2,
      sizes: [50, 50],
    })
    expect(
      observedSnapshots.every(({ paneCount, sizeCount }) => paneCount === 0 || paneCount === sizeCount),
    ).toBe(true)
    expect(useWorkspaceStore.getState().workspaceStateByProject['project-a']?.terminalPaneSizes).toEqual([
      33.333333333333336,
      33.333333333333336,
      33.333333333333336,
    ])
  })

  it('removes an exited pane and rebalances the remaining layout', () => {
    useWorkspaceStore.setState({
      terminalProjectStateByProject: {
        'project-a': {
          paneOrder: ['main', 'pane-second'],
          panesById: {
            main: {
              agentStatus: {
                agent: 'unknown',
                phase: 'idle',
              },
              cwd: '/tmp/flowterm',
              history: '',
              paneId: 'main',
              projectId: 'project-a',
              sessionId: 'session-main',
              shellLabel: 'zsh',
              state: 'idle',
            },
            'pane-second': {
              agentStatus: {
                agent: 'unknown',
                phase: 'idle',
              },
              cwd: '/tmp/flowterm',
              history: '',
              paneId: 'pane-second',
              projectId: 'project-a',
              sessionId: 'session-second',
              shellLabel: 'zsh',
              state: 'running',
            },
          },
        },
      },
      workspaceStateByProject: {
        'project-a': {
          selectedFilePath: null,
          terminalPaneSizes: [50, 50],
          treeExpandedPaths: {},
        },
      },
    })

    useWorkspaceStore.getState().updateTerminalState({
      paneId: 'pane-second',
      projectId: 'project-a',
      sessionId: 'session-second',
      state: 'exited',
    })

    expect(useWorkspaceStore.getState().terminalProjectStateByProject['project-a']).toEqual({
      paneOrder: ['main'],
      panesById: {
        main: expect.objectContaining({
          paneId: 'main',
          sessionId: 'session-main',
        }),
      },
    })
    expect(useWorkspaceStore.getState().workspaceStateByProject['project-a']?.terminalPaneSizes).toEqual([
      100,
    ])
  })

  it('allows the final pane to disappear after ctrl+d exits the shell', () => {
    useWorkspaceStore.setState({
      terminalProjectStateByProject: {
        'project-a': {
          paneOrder: ['main'],
          panesById: {
            main: {
              agentStatus: {
                agent: 'unknown',
                phase: 'idle',
              },
              cwd: '/tmp/flowterm',
              history: '',
              paneId: 'main',
              projectId: 'project-a',
              sessionId: 'session-main',
              shellLabel: 'zsh',
              state: 'idle',
            },
          },
        },
      },
      workspaceStateByProject: {
        'project-a': {
          selectedFilePath: null,
          terminalPaneSizes: [100],
          treeExpandedPaths: {},
        },
      },
    })

    useWorkspaceStore.getState().updateTerminalState({
      paneId: 'main',
      projectId: 'project-a',
      sessionId: 'session-main',
      state: 'exited',
    })

    expect(useWorkspaceStore.getState().terminalProjectStateByProject['project-a']).toEqual({
      paneOrder: [],
      panesById: {},
    })
    expect(useWorkspaceStore.getState().workspaceStateByProject['project-a']?.terminalPaneSizes).toEqual([])
  })
})

describe('workspace store project summaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetWorkspaceState()
    isTauriEnvironmentMock.mockReturnValue(true)
    saveProjectWorkspaceMock.mockResolvedValue(undefined)
    refreshProjectSnapshotMock.mockResolvedValue({
      backend: 'xterm',
      files: [
        {
          gitStatus: 'M',
          kind: 'file',
          liveStatus: 'modified',
          path: 'src/App.tsx',
        },
        {
          gitStatus: '?',
          kind: 'file',
          liveStatus: 'idle',
          path: 'README.md',
        },
      ],
      project: {
        changedFileCount: 2,
        hasLiveActivity: true,
        id: 'project-a',
        name: 'Flowterm',
        path: '/tmp/flowterm',
        terminalState: 'idle',
        untrackedFileCount: 1,
      },
    })
  })

  it('refreshes tab summaries when the active project snapshot changes', async () => {
    useWorkspaceStore.setState({
      activeProjectId: 'project-a',
      projects: [
        {
          changedFileCount: 0,
          hasLiveActivity: false,
          id: 'project-a',
          name: 'Flowterm',
          path: '/tmp/flowterm',
          terminalState: 'idle',
          untrackedFileCount: 0,
        },
      ],
      selectedFilePath: 'src/App.tsx',
      snapshot: {
        backend: 'xterm',
        files: [],
        project: {
          changedFileCount: 0,
          hasLiveActivity: false,
          id: 'project-a',
          name: 'Flowterm',
          path: '/tmp/flowterm',
          terminalState: 'idle',
          untrackedFileCount: 0,
        },
      },
      workspaceStateByProject: {
        'project-a': {
          selectedFilePath: 'src/App.tsx',
          terminalPaneSizes: [100],
          treeExpandedPaths: {},
        },
      },
    })

    await useWorkspaceStore.getState().refreshActiveProject('project-a', {
      changedPaths: ['src/App.tsx'],
    })

    expect(useWorkspaceStore.getState().projects).toEqual([
      expect.objectContaining({
        changedFileCount: 2,
        hasLiveActivity: true,
        id: 'project-a',
        untrackedFileCount: 1,
      }),
    ])
  })

  it('updates tab summaries when terminal state changes', () => {
    useWorkspaceStore.setState({
      projects: [
        {
          changedFileCount: 0,
          hasLiveActivity: false,
          id: 'project-a',
          name: 'Flowterm',
          path: '/tmp/flowterm',
          terminalState: 'idle',
          untrackedFileCount: 0,
        },
      ],
      terminalProjectStateByProject: {
        'project-a': {
          paneOrder: ['main'],
          panesById: {
            main: {
              agentStatus: {
                agent: 'unknown',
                phase: 'idle',
              },
              cwd: '/tmp/flowterm',
              history: '',
              paneId: 'main',
              projectId: 'project-a',
              sessionId: 'session-main',
              shellLabel: 'zsh',
              state: 'idle',
            },
          },
        },
      },
    })

    useWorkspaceStore.getState().updateTerminalState({
      paneId: 'main',
      projectId: 'project-a',
      sessionId: 'session-main',
      state: 'running',
    })

    expect(useWorkspaceStore.getState().projects).toEqual([
      expect.objectContaining({
        id: 'project-a',
        terminalState: 'running',
      }),
    ])
  })
})
