import { waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppBootstrap, FilePreview } from '../lib/contracts'

const {
  addProjectMock,
  activateProjectMock,
  attachTerminalMock,
  bootstrapAppMock,
  createProjectEntryMock,
  isTauriEnvironmentMock,
  listTerminalsMock,
  openDialogMock,
  readFilePreviewMock,
  readProjectWorkspaceMock,
  refreshProjectSnapshotMock,
  saveProjectWorkspaceMock,
} = vi.hoisted(() => ({
  addProjectMock: vi.fn(),
  activateProjectMock: vi.fn(),
  attachTerminalMock: vi.fn(),
  bootstrapAppMock: vi.fn(),
  createProjectEntryMock: vi.fn(),
  isTauriEnvironmentMock: vi.fn(),
  listTerminalsMock: vi.fn(),
  openDialogMock: vi.fn(),
  readFilePreviewMock: vi.fn(),
  readProjectWorkspaceMock: vi.fn(),
  refreshProjectSnapshotMock: vi.fn(),
  saveProjectWorkspaceMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: openDialogMock,
}))

vi.mock('../lib/tauri', () => ({
  activateProject: activateProjectMock,
  addProject: addProjectMock,
  attachTerminal: attachTerminalMock,
  bootstrapApp: bootstrapAppMock,
  closeTerminal: vi.fn(),
  createProjectEntry: createProjectEntryMock,
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

function createDeferred<Value>(): {
  promise: Promise<Value>
  reject: (reason?: unknown) => void
  resolve: (value: Value) => void
} {
  let resolvePromise!: (value: Value) => void
  let rejectPromise!: (reason?: unknown) => void
  const promise = new Promise<Value>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })

  return {
    promise,
    reject: rejectPromise,
    resolve: resolvePromise,
  }
}

function resetWorkspaceState(): void {
  useWorkspaceStore.setState({
    activeProjectId: null,
    error: null,
    filePreview: null,
    filePreviewByCacheKey: {},
    isBooting: true,
    isFilePreviewLoading: false,
    isProjectSwitching: false,
    previewRequestId: 0,
    projectSelectionRequestId: 0,
    projects: [],
    recentProjectIds: [],
    selectedFilePath: null,
    snapshot: null,
    snapshotByProject: {},
    terminalProjectStateByProject: {},
    workspaceStateByProject: {},
  })
}

describe('workspace store add project', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetWorkspaceState()
    isTauriEnvironmentMock.mockReturnValue(true)
    openDialogMock.mockResolvedValue('/tmp/flowterm-notes')
    addProjectMock.mockResolvedValue({
      activeProjectId: 'flowterm-notes',
      projects: [
        {
          changedFileCount: 0,
          hasLiveActivity: false,
          id: 'flowterm-notes',
          name: 'flowterm-notes',
          path: '/tmp/flowterm-notes',
          terminalState: 'idle',
          untrackedFileCount: 0,
        },
      ],
      snapshot: null,
      terminals: [],
      workspaceState: null,
    })
  })

  it('opens the native folder picker and submits the selected folder name as the project name', async () => {
    await useWorkspaceStore.getState().openProjectDialog()

    expect(openDialogMock).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      title: '选择项目目录',
    })
    expect(addProjectMock).toHaveBeenCalledWith('/tmp/flowterm-notes', 'flowterm-notes')
  })
})

describe('workspace store bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
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
    activateProjectMock.mockResolvedValue(bootstrapPayload.snapshot)
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

  it('keeps project tabs in stored order while tracking recent usage separately', async () => {
    localStorage.setItem('flowterm:recent-project-ids', JSON.stringify(['project-b', 'project-a']))
    bootstrapAppMock.mockResolvedValue({
      ...bootstrapPayload,
      activeProjectId: 'project-b',
      projects: [
        {
          ...bootstrapPayload.projects[0],
          id: 'project-a',
          name: 'Flowterm',
          path: '/tmp/flowterm',
        },
        {
          changedFileCount: 0,
          hasLiveActivity: false,
          id: 'project-b',
          name: 'Notes',
          path: '/tmp/notes',
          terminalState: 'idle',
          untrackedFileCount: 0,
        },
      ],
      snapshot: {
        ...bootstrapPayload.snapshot!,
        project: {
          changedFileCount: 0,
          hasLiveActivity: false,
          id: 'project-b',
          name: 'Notes',
          path: '/tmp/notes',
          terminalState: 'idle',
          untrackedFileCount: 0,
        },
      },
    })

    await useWorkspaceStore.getState().bootstrap()

    expect(useWorkspaceStore.getState().projects.map((project) => project.id)).toEqual([
      'project-a',
      'project-b',
    ])
    expect(useWorkspaceStore.getState().recentProjectIds).toEqual([
      'project-b',
      'project-a',
    ])
  })

  it('keeps tab order stable after selecting another recent project', async () => {
    activateProjectMock.mockResolvedValue({
      backend: 'xterm',
      files: [],
      project: {
        changedFileCount: 0,
        hasLiveActivity: false,
        id: 'project-b',
        name: 'Paperclip',
        path: '/tmp/paperclip',
        terminalState: 'idle',
        untrackedFileCount: 0,
      },
    })

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
          name: 'Paperclip',
          path: '/tmp/paperclip',
          terminalState: 'idle',
          untrackedFileCount: 0,
        },
      ],
      recentProjectIds: ['project-a', 'project-b'],
    })

    await useWorkspaceStore.getState().selectProject('project-b')

    expect(useWorkspaceStore.getState().projects.map((project) => project.id)).toEqual([
      'project-a',
      'project-b',
    ])
    expect(useWorkspaceStore.getState().recentProjectIds).toEqual(['project-b', 'project-a'])
  })

  it('switches the active tab immediately while the next project hydrates in background', async () => {
    const snapshotHydration = createDeferred<typeof bootstrapPayload.snapshot>()
    const workspaceHydration = createDeferred<{
      activePaneId?: string | null
      isSplitView?: boolean
      railWidth?: number
      selectedFilePath: string | null
      terminalPaneSizes: number[]
      treeExpandedPaths: Record<string, boolean>
    }>()
    const terminalHydration = createDeferred<[]>()

    activateProjectMock.mockReturnValue(snapshotHydration.promise)
    readProjectWorkspaceMock.mockReturnValue(workspaceHydration.promise)
    listTerminalsMock.mockReturnValue(terminalHydration.promise)

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
          name: 'Paperclip',
          path: '/tmp/paperclip',
          terminalState: 'idle',
          untrackedFileCount: 0,
        },
      ],
      recentProjectIds: ['project-a', 'project-b'],
      selectedFilePath: 'src/App.tsx',
      snapshot: bootstrapPayload.snapshot,
    })

    const selectPromise = useWorkspaceStore.getState().selectProject('project-b')

    expect(useWorkspaceStore.getState()).toMatchObject({
      activeProjectId: 'project-b',
      isProjectSwitching: false,
      recentProjectIds: ['project-b', 'project-a'],
      selectedFilePath: null,
      snapshot: null,
    })

    const pendingStatus = await Promise.race([
      selectPromise.then(() => 'resolved'),
      new Promise<'pending'>((resolve) => {
        setTimeout(() => resolve('pending'), 0)
      }),
    ])

    expect(pendingStatus).toBe('pending')

    snapshotHydration.resolve({
      backend: 'xterm',
      files: [],
      project: {
        changedFileCount: 0,
        hasLiveActivity: false,
        id: 'project-b',
        name: 'Paperclip',
        path: '/tmp/paperclip',
        terminalState: 'idle',
        untrackedFileCount: 0,
      },
    })
    workspaceHydration.resolve({
      selectedFilePath: null,
      terminalPaneSizes: [],
      treeExpandedPaths: {},
    })
    terminalHydration.resolve([])

    await selectPromise

    expect(useWorkspaceStore.getState()).toMatchObject({
      activeProjectId: 'project-b',
      isProjectSwitching: false,
      recentProjectIds: ['project-b', 'project-a'],
    })
    expect(useWorkspaceStore.getState().snapshot?.project.id).toBe('project-b')
  })

  it('ignores stale project hydration when a newer tab switch wins', async () => {
    const firstSnapshotHydration = createDeferred<typeof bootstrapPayload.snapshot>()
    const firstWorkspaceHydration = createDeferred<{
      activePaneId?: string | null
      isSplitView?: boolean
      railWidth?: number
      selectedFilePath: string | null
      terminalPaneSizes: number[]
      treeExpandedPaths: Record<string, boolean>
    }>()
    const firstTerminalHydration = createDeferred<[]>()

    activateProjectMock
      .mockReturnValueOnce(firstSnapshotHydration.promise)
      .mockResolvedValueOnce({
        backend: 'xterm',
        files: [],
        project: {
          changedFileCount: 0,
          hasLiveActivity: false,
          id: 'project-c',
          name: 'Notes',
          path: '/tmp/notes',
          terminalState: 'idle',
          untrackedFileCount: 0,
        },
      })
    readProjectWorkspaceMock
      .mockReturnValueOnce(firstWorkspaceHydration.promise)
      .mockResolvedValueOnce({
        selectedFilePath: null,
        terminalPaneSizes: [],
        treeExpandedPaths: {},
      })
    listTerminalsMock
      .mockReturnValueOnce(firstTerminalHydration.promise)
      .mockResolvedValueOnce([])

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
          name: 'Paperclip',
          path: '/tmp/paperclip',
          terminalState: 'idle',
          untrackedFileCount: 0,
        },
        {
          changedFileCount: 0,
          hasLiveActivity: false,
          id: 'project-c',
          name: 'Notes',
          path: '/tmp/notes',
          terminalState: 'idle',
          untrackedFileCount: 0,
        },
      ],
      recentProjectIds: ['project-a', 'project-b', 'project-c'],
      snapshot: bootstrapPayload.snapshot,
    })

    const firstSwitch = useWorkspaceStore.getState().selectProject('project-b')
    const secondSwitch = useWorkspaceStore.getState().selectProject('project-c')

    await secondSwitch

    expect(useWorkspaceStore.getState()).toMatchObject({
      activeProjectId: 'project-c',
      isProjectSwitching: false,
    })
    expect(useWorkspaceStore.getState().snapshot?.project.id).toBe('project-c')

    firstSnapshotHydration.resolve({
      backend: 'xterm',
      files: [],
      project: {
        changedFileCount: 0,
        hasLiveActivity: false,
        id: 'project-b',
        name: 'Paperclip',
        path: '/tmp/paperclip',
        terminalState: 'idle',
        untrackedFileCount: 0,
      },
    })
    firstWorkspaceHydration.resolve({
      selectedFilePath: null,
      terminalPaneSizes: [],
      treeExpandedPaths: {},
    })
    firstTerminalHydration.resolve([])

    await firstSwitch

    expect(useWorkspaceStore.getState().activeProjectId).toBe('project-c')
    expect(useWorkspaceStore.getState().snapshot?.project.id).toBe('project-c')
  })

  it('reuses cached snapshot and preview immediately when returning to a project', async () => {
    const snapshotHydration = createDeferred<typeof bootstrapPayload.snapshot>()
    const workspaceHydration = createDeferred<{
      activePaneId?: string | null
      isSplitView?: boolean
      railWidth?: number
      selectedFilePath: string | null
      terminalPaneSizes: number[]
      treeExpandedPaths: Record<string, boolean>
    }>()
    const terminalHydration = createDeferred<[]>()
    const cachedPreview: FilePreview = {
      gitStatus: 'M',
      imageDataUrl: null,
      lines: [
        {
          content: 'cached preview',
          kind: 'added',
          newLineNumber: 1,
          oldLineNumber: null,
        },
      ],
      liveStatus: 'modified',
      mode: 'diff',
      path: 'src/main.ts',
      startLine: 0,
      totalLines: 1,
    }

    readFilePreviewMock.mockResolvedValue(cachedPreview)
    activateProjectMock.mockReturnValue(snapshotHydration.promise)
    readProjectWorkspaceMock.mockReturnValue(workspaceHydration.promise)
    listTerminalsMock.mockReturnValue(terminalHydration.promise)

    useWorkspaceStore.setState({
      activeProjectId: 'project-a',
      filePreviewByCacheKey: {
        'project-b::src/main.ts': cachedPreview,
      },
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
          name: 'Paperclip',
          path: '/tmp/paperclip',
          terminalState: 'idle',
          untrackedFileCount: 0,
        },
      ],
      recentProjectIds: ['project-a', 'project-b'],
      snapshot: bootstrapPayload.snapshot,
      snapshotByProject: {
        'project-a': bootstrapPayload.snapshot!,
        'project-b': {
          backend: 'xterm',
          files: [
            {
              gitStatus: 'M',
              kind: 'file',
              liveStatus: 'modified',
              path: 'src/main.ts',
            },
          ],
          project: {
            changedFileCount: 0,
            hasLiveActivity: false,
            id: 'project-b',
            name: 'Paperclip',
            path: '/tmp/paperclip',
            terminalState: 'idle',
            untrackedFileCount: 0,
          },
        },
      },
      workspaceStateByProject: {
        'project-b': {
          activePaneId: 'main',
          isSplitView: true,
          railWidth: 44,
          selectedFilePath: 'src/main.ts',
          terminalPaneSizes: [100],
          treeExpandedPaths: {},
        },
      },
    })

    const selectPromise = useWorkspaceStore.getState().selectProject('project-b')

    expect(useWorkspaceStore.getState()).toMatchObject({
      activeProjectId: 'project-b',
      filePreview: cachedPreview,
      selectedFilePath: 'src/main.ts',
    })
    expect(useWorkspaceStore.getState().snapshot?.project.id).toBe('project-b')

    snapshotHydration.resolve({
      backend: 'xterm',
      files: [
        {
          gitStatus: 'M',
          kind: 'file',
          liveStatus: 'modified',
          path: 'src/main.ts',
        },
      ],
      project: {
        changedFileCount: 0,
        hasLiveActivity: false,
        id: 'project-b',
        name: 'Paperclip',
        path: '/tmp/paperclip',
        terminalState: 'idle',
        untrackedFileCount: 0,
      },
    })
    workspaceHydration.resolve({
      activePaneId: 'main',
      isSplitView: true,
      railWidth: 44,
      selectedFilePath: 'src/main.ts',
      terminalPaneSizes: [100],
      treeExpandedPaths: {},
    })
    terminalHydration.resolve([])

    await selectPromise

    expect(useWorkspaceStore.getState().filePreview).toEqual(cachedPreview)
    expect(readFilePreviewMock).toHaveBeenCalledWith('project-b', 'src/main.ts', {
      lineCount: 200,
      startLine: 0,
    })
  })

  it('skips terminal and workspace reload when revisiting a hydrated project', async () => {
    const snapshotHydration = createDeferred<typeof bootstrapPayload.snapshot>()

    activateProjectMock.mockReturnValue(snapshotHydration.promise)

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
          name: 'Paperclip',
          path: '/tmp/paperclip',
          terminalState: 'idle',
          untrackedFileCount: 0,
        },
      ],
      recentProjectIds: ['project-a', 'project-b'],
      snapshot: bootstrapPayload.snapshot,
      snapshotByProject: {
        'project-a': bootstrapPayload.snapshot!,
        'project-b': {
          backend: 'xterm',
          files: [
            {
              gitStatus: 'M',
              kind: 'file',
              liveStatus: 'modified',
              path: 'src/main.ts',
            },
          ],
          project: {
            changedFileCount: 0,
            hasLiveActivity: false,
            id: 'project-b',
            name: 'Paperclip',
            path: '/tmp/paperclip',
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
              agentStatus: {
                agent: 'unknown',
                phase: 'idle',
              },
              cwd: '/tmp/paperclip',
              history: '$ pwd\n/tmp/paperclip\n',
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
          isSplitView: true,
          railWidth: 44,
          selectedFilePath: 'src/main.ts',
          terminalPaneSizes: [100],
          treeExpandedPaths: {},
        },
      },
    })

    const selectPromise = useWorkspaceStore.getState().selectProject('project-b')

    expect(readProjectWorkspaceMock).not.toHaveBeenCalled()
    expect(listTerminalsMock).not.toHaveBeenCalled()

    snapshotHydration.resolve({
      backend: 'xterm',
      files: [
        {
          gitStatus: 'M',
          kind: 'file',
          liveStatus: 'modified',
          path: 'src/main.ts',
        },
      ],
      project: {
        changedFileCount: 0,
        hasLiveActivity: false,
        id: 'project-b',
        name: 'Paperclip',
        path: '/tmp/paperclip',
        terminalState: 'idle',
        untrackedFileCount: 0,
      },
    })

    await selectPromise

    expect(readProjectWorkspaceMock).not.toHaveBeenCalled()
    expect(listTerminalsMock).not.toHaveBeenCalled()
    expect(useWorkspaceStore.getState().workspaceStateByProject['project-b']?.activePaneId).toBe(
      'main',
    )
  })

  it('reorders project tabs and keeps the new order stable', () => {
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
        {
          changedFileCount: 0,
          hasLiveActivity: false,
          id: 'project-b',
          name: 'Paperclip',
          path: '/tmp/paperclip',
          terminalState: 'idle',
          untrackedFileCount: 0,
        },
        {
          changedFileCount: 0,
          hasLiveActivity: false,
          id: 'project-c',
          name: 'Notes',
          path: '/tmp/notes',
          terminalState: 'idle',
          untrackedFileCount: 0,
        },
      ],
    })

    useWorkspaceStore.getState().reorderProjects('project-c', 'project-a')

    expect(useWorkspaceStore.getState().projects.map((project) => project.id)).toEqual([
      'project-c',
      'project-a',
      'project-b',
    ])
  })
})

describe('workspace store create project entry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetWorkspaceState()
    isTauriEnvironmentMock.mockReturnValue(true)
    createProjectEntryMock.mockImplementation(async (_projectId, path) => path)
    saveProjectWorkspaceMock.mockResolvedValue(undefined)
  })

  it('creates a file, expands its parent path, and selects it for preview', async () => {
    const preview: FilePreview = {
      gitStatus: '?',
      imageDataUrl: null,
      lines: [],
      liveStatus: 'added',
      mode: 'text',
      path: 'src/generated/use-flowterm.ts',
      startLine: 0,
      totalLines: 0,
    }

    refreshProjectSnapshotMock.mockResolvedValue({
      backend: 'xterm',
      files: [
        {
          gitStatus: '?',
          kind: 'file',
          liveStatus: 'added',
          path: 'src/generated/use-flowterm.ts',
        },
      ],
      project: {
        changedFileCount: 1,
        hasLiveActivity: false,
        id: 'project-a',
        name: 'Flowterm',
        path: '/tmp/flowterm',
        terminalState: 'idle',
        untrackedFileCount: 1,
      },
    })
    readFilePreviewMock.mockResolvedValue(preview)

    useWorkspaceStore.setState({
      activeProjectId: 'project-a',
      projects: bootstrapPayload.projects,
      snapshot: bootstrapPayload.snapshot,
      workspaceStateByProject: {
        'project-a': {
          activePaneId: 'main',
          isSplitView: true,
          railWidth: 44,
          selectedFilePath: 'src/App.tsx',
          terminalPaneSizes: [100],
          treeExpandedPaths: {},
        },
      },
    })

    await useWorkspaceStore
      .getState()
      .createProjectEntry('project-a', 'src/generated/use-flowterm.ts', 'file')

    expect(createProjectEntryMock).toHaveBeenCalledWith(
      'project-a',
      'src/generated/use-flowterm.ts',
      'file',
    )
    expect(useWorkspaceStore.getState().selectedFilePath).toBe('src/generated/use-flowterm.ts')
    expect(
      useWorkspaceStore.getState().workspaceStateByProject['project-a']?.treeExpandedPaths,
    ).toMatchObject({
      src: true,
      'src/generated': true,
    })
    expect(readFilePreviewMock).toHaveBeenCalledWith(
      'project-a',
      'src/generated/use-flowterm.ts',
      {
        lineCount: 200,
        startLine: 0,
      },
    )
  })

  it('creates a folder and keeps the new branch expanded without changing file selection', async () => {
    refreshProjectSnapshotMock.mockResolvedValue({
      backend: 'xterm',
      files: [
        {
          gitStatus: ' ',
          kind: 'file',
          liveStatus: 'idle',
          path: 'src/App.tsx',
        },
      ],
      project: {
        changedFileCount: 0,
        hasLiveActivity: false,
        id: 'project-a',
        name: 'Flowterm',
        path: '/tmp/flowterm',
        terminalState: 'idle',
        untrackedFileCount: 0,
      },
    })

    useWorkspaceStore.setState({
      activeProjectId: 'project-a',
      projects: bootstrapPayload.projects,
      selectedFilePath: 'src/App.tsx',
      snapshot: bootstrapPayload.snapshot,
      workspaceStateByProject: {
        'project-a': {
          activePaneId: 'main',
          isSplitView: true,
          railWidth: 44,
          selectedFilePath: 'src/App.tsx',
          terminalPaneSizes: [100],
          treeExpandedPaths: {
            src: true,
          },
        },
      },
    })

    await useWorkspaceStore
      .getState()
      .createProjectEntry('project-a', 'src/snippets', 'folder')

    expect(createProjectEntryMock).toHaveBeenCalledWith('project-a', 'src/snippets', 'folder')
    expect(useWorkspaceStore.getState().selectedFilePath).toBe('src/App.tsx')
    expect(
      useWorkspaceStore.getState().workspaceStateByProject['project-a']?.treeExpandedPaths,
    ).toMatchObject({
      src: true,
      'src/snippets': true,
    })
    expect(readFilePreviewMock).not.toHaveBeenCalled()
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
          activePaneId: 'main',
          isSplitView: true,
          railWidth: 44,
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

  it('enters split view and focuses the new pane when adding another terminal', async () => {
    attachTerminalMock.mockResolvedValue({
      agentStatus: {
        agent: 'unknown',
        phase: 'idle',
      },
      cwd: '/tmp/docs',
      history: '',
      paneId: 'pane-second',
      projectId: 'project-a',
      sessionId: 'session-second',
      shellLabel: 'zsh',
      state: 'idle',
    })

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
          activePaneId: 'main',
          isSplitView: false,
          railWidth: 44,
          selectedFilePath: null,
          terminalPaneSizes: [100],
          treeExpandedPaths: {},
        },
      },
    })

    await useWorkspaceStore.getState().addTerminalPane('project-a')

    expect(useWorkspaceStore.getState().workspaceStateByProject['project-a']).toMatchObject({
      activePaneId: 'pane-second',
      isSplitView: true,
      terminalPaneSizes: [50, 50],
    })
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
          activePaneId: 'main',
          isSplitView: true,
          railWidth: 44,
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
          activePaneId: 'main',
          isSplitView: true,
          railWidth: 44,
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
          activePaneId: 'main',
          isSplitView: true,
          railWidth: 44,
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
