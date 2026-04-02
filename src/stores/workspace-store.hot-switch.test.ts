import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  activateProjectMock,
  focusProjectMock,
  isTauriEnvironmentMock,
  listRecentProjectsMock,
  listTerminalsMock,
  readProjectWorkspaceMock,
  saveProjectWorkspaceMock,
} = vi.hoisted(() => ({
  activateProjectMock: vi.fn(),
  focusProjectMock: vi.fn(),
  isTauriEnvironmentMock: vi.fn(),
  listRecentProjectsMock: vi.fn(),
  listTerminalsMock: vi.fn(),
  readProjectWorkspaceMock: vi.fn(),
  saveProjectWorkspaceMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}))

vi.mock('../lib/tauri', () => ({
  activateProject: activateProjectMock,
  addProject: vi.fn(),
  attachTerminal: vi.fn(),
  bootstrapApp: vi.fn(),
  closeTerminal: vi.fn(),
  createProjectEntry: vi.fn(),
  focusProject: focusProjectMock,
  isTauriEnvironment: isTauriEnvironmentMock,
  listRecentProjects: listRecentProjectsMock,
  listTerminals: listTerminalsMock,
  readFilePreview: vi.fn(),
  readProjectWorkspace: readProjectWorkspaceMock,
  refreshProjectSnapshot: vi.fn(),
  removeProject: vi.fn(),
  resizeTerminal: vi.fn(),
  saveProjectWorkspace: saveProjectWorkspaceMock,
  writeTerminal: vi.fn(),
}))

import { useWorkspaceStore } from './workspace-store'

function resetWorkspaceState(): void {
  useWorkspaceStore.setState({
    activeProjectId: null,
    error: null,
    filePreview: null,
    filePreviewByCacheKey: {},
    isBooting: false,
    isFilePreviewLoading: false,
    isProjectSwitching: false,
    previewRequestId: 0,
    projectSelectionRequestId: 0,
    projects: [],
    recentProjects: [],
    selectedFilePath: null,
    snapshot: null,
    snapshotByProject: {},
    terminalProjectStateByProject: {},
    workspaceStateByProject: {},
  })
}

describe('workspace store hydrated project switch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    resetWorkspaceState()
    isTauriEnvironmentMock.mockReturnValue(true)
    listRecentProjectsMock.mockResolvedValue([])
    saveProjectWorkspaceMock.mockResolvedValue(undefined)
    focusProjectMock.mockResolvedValue(undefined)
  })

  it('focuses a hydrated project without re-running snapshot activation', async () => {
    activateProjectMock.mockImplementation(
      () => new Promise(() => {}),
    )

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
        {
          changedFileCount: 0,
          hasLiveActivity: false,
          id: 'project-b',
          name: 'Notebook',
          path: '/tmp/notebook',
          terminalState: 'idle',
          untrackedFileCount: 0,
        },
      ],
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
      snapshotByProject: {
        'project-b': {
          backend: 'xterm',
          files: [
            {
              gitStatus: ' ',
              kind: 'file',
              liveStatus: 'idle',
              path: 'README.md',
            },
          ],
          project: {
            changedFileCount: 0,
            hasLiveActivity: false,
            id: 'project-b',
            name: 'Notebook',
            path: '/tmp/notebook',
            terminalState: 'idle',
            untrackedFileCount: 0,
          },
        },
      },
      terminalProjectStateByProject: {
        'project-b': {
          paneOrder: ['main'],
          panesById: {
            main: {
              agentStatus: { agent: 'unknown', phase: 'idle' },
              cwd: '/tmp/notebook',
              history: '',
              paneId: 'main',
              projectId: 'project-b',
              sessionId: 'session-main',
              shellLabel: 'zsh',
              state: 'idle',
            },
          },
        },
      },
      workspaceStateByProject: {
        'project-b': {
          activePaneId: 'main',
          isSplitView: false,
          railWidth: 44,
          selectedFilePath: 'README.md',
          terminalPaneSizes: [100],
          treeExpandedPaths: {},
        },
      },
    })

    await useWorkspaceStore.getState().selectProject('project-b')

    expect(useWorkspaceStore.getState().activeProjectId).toBe('project-b')
    expect(useWorkspaceStore.getState().snapshot?.project.id).toBe('project-b')
    expect(readProjectWorkspaceMock).not.toHaveBeenCalled()
    expect(listTerminalsMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(80)

    expect(focusProjectMock).toHaveBeenCalledWith('project-b')
    expect(activateProjectMock).not.toHaveBeenCalled()
    expect(listRecentProjectsMock).toHaveBeenCalledTimes(1)
  })
})
