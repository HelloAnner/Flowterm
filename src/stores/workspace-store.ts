import { open } from '@tauri-apps/plugin-dialog'
import { create } from 'zustand'

import {
  activateProject,
  addProject as addProjectCommand,
  attachTerminal,
  bootstrapApp,
  closeTerminal as closeTerminalCommand,
  isTauriEnvironment,
  readFilePreview,
  refreshProjectSnapshot,
  removeProject as removeProjectCommand,
  resizeTerminal as resizeTerminalCommand,
  writeTerminal as writeTerminalCommand,
} from '../lib/tauri'
import type {
  AppBootstrap,
  FilePreview,
  ProjectSnapshot,
  ProjectSummary,
  TerminalAttachment,
  TerminalStateEvent,
} from '../lib/contracts'
import { resolveSelectedFilePath } from '../features/workspace/selection'
import {
  applyTerminalAttachment as applyTerminalPaneAttachment,
  createTerminalProjectState,
  removeTerminalPane as removeTerminalPaneState,
  type TerminalProjectState,
  updateTerminalState as updateTerminalPaneState,
} from '../features/workspace/terminal-panes'

const MAX_TERMINAL_PANES = 3
const PREVIEW_CHUNK_SIZE = 200

interface WorkspaceState {
  activeProjectId: string | null
  draftName: string
  draftPath: string
  error: string | null
  filePreview: FilePreview | null
  isBooting: boolean
  isFilePreviewLoading: boolean
  isProjectDialogOpen: boolean
  previewRequestId: number
  projects: ProjectSummary[]
  selectedFilePath: string | null
  snapshot: ProjectSnapshot | null
  terminalProjectStateByProject: Record<string, TerminalProjectState>
  addTerminalPane: (projectId: string) => Promise<void>
  applyBootstrap: (bootstrap: AppBootstrap) => void
  attachTerminalPane: (projectId: string, paneId?: string) => Promise<TerminalAttachment>
  bootstrap: () => Promise<void>
  closeProjectDialog: () => void
  fetchFilePreview: (
    projectId?: string | null,
    path?: string | null,
    options?: {
      lineCount?: number
      startLine?: number
    },
  ) => Promise<void>
  openProjectDialog: () => void
  pickProjectDirectory: () => Promise<void>
  refreshActiveProject: (projectId?: string) => Promise<void>
  removeProject: (projectId: string) => Promise<void>
  removeTerminalPane: (projectId: string, paneId: string) => Promise<void>
  resizeTerminal: (sessionId: string, cols: number, rows: number) => Promise<void>
  selectFile: (path: string) => Promise<void>
  selectProject: (projectId: string) => Promise<void>
  setDraftName: (value: string) => void
  setDraftPath: (value: string) => void
  submitProject: () => Promise<void>
  updateTerminalState: (event: TerminalStateEvent) => void
  writeTerminal: (sessionId: string, data: string) => Promise<void>
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
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
  addTerminalPane: async (projectId) => {
    const projectState = ensureProjectTerminalState(
      get().terminalProjectStateByProject,
      projectId,
    )

    if (projectState.paneOrder.length >= MAX_TERMINAL_PANES) {
      return
    }

    await get().attachTerminalPane(projectId, createPaneId())
  },
  applyBootstrap: (bootstrap) => {
    const allowedProjectIds = new Set(bootstrap.projects.map((project) => project.id))
    const terminalProjectStateByProject = Object.fromEntries(
      Object.entries(get().terminalProjectStateByProject).filter(([projectId]) =>
        allowedProjectIds.has(projectId),
      ),
    )

    if (bootstrap.terminal) {
      terminalProjectStateByProject[bootstrap.terminal.projectId] = applyTerminalPaneAttachment(
        ensureProjectTerminalState(terminalProjectStateByProject, bootstrap.terminal.projectId),
        bootstrap.terminal,
      )
    }

    set({
      activeProjectId: bootstrap.activeProjectId,
      error: null,
      filePreview: null,
      isBooting: false,
      projects: bootstrap.projects,
      selectedFilePath: resolveSnapshotSelection(bootstrap.snapshot, get().selectedFilePath),
      snapshot: bootstrap.snapshot,
      terminalProjectStateByProject,
    })
  },
  attachTerminalPane: async (projectId, paneId) => {
    const targetPaneId = paneId ?? 'main'
    const terminal = isTauriEnvironment()
      ? await attachTerminal(projectId, paneId)
      : createMockTerminalAttachment(projectId, targetPaneId)

    set((state) => ({
      terminalProjectStateByProject: {
        ...state.terminalProjectStateByProject,
        [projectId]: applyTerminalPaneAttachment(
          ensureProjectTerminalState(state.terminalProjectStateByProject, projectId),
          terminal,
        ),
      },
    }))

    return terminal
  },
  bootstrap: async () => {
    set({ error: null, isBooting: true })

    try {
      if (!isTauriEnvironment()) {
        get().applyBootstrap(createMockBootstrap())
        return
      }

      const bootstrap = await bootstrapApp()
      get().applyBootstrap(bootstrap)

      if (bootstrap.activeProjectId) {
        await get().attachTerminalPane(bootstrap.activeProjectId)
        await get().fetchFilePreview(
          bootstrap.activeProjectId,
          resolveSnapshotSelection(bootstrap.snapshot, get().selectedFilePath),
        )
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '初始化失败',
        isBooting: false,
      })
    }
  },
  closeProjectDialog: () => {
    set({ isProjectDialogOpen: false })
  },
  fetchFilePreview: async (projectId, path, options) => {
    const targetProjectId = projectId ?? get().activeProjectId
    const targetPath = path ?? get().selectedFilePath

    if (!targetProjectId || !targetPath) {
      set({ filePreview: null, isFilePreviewLoading: false })
      return
    }

    const requestId = get().previewRequestId + 1
    set({ isFilePreviewLoading: true, previewRequestId: requestId })

    try {
      const preview = isTauriEnvironment()
        ? await readFilePreview(targetProjectId, targetPath, {
            lineCount: options?.lineCount ?? PREVIEW_CHUNK_SIZE,
            startLine: options?.startLine ?? 0,
          })
        : createMockPreview(get().snapshot, targetPath)

      const state = get()

      if (
        state.activeProjectId !== targetProjectId ||
        state.selectedFilePath !== targetPath ||
        state.previewRequestId !== requestId
      ) {
        return
      }

      set({
        error: null,
        filePreview: preview,
        isFilePreviewLoading: false,
      })
    } catch (error) {
      const state = get()

      if (state.previewRequestId !== requestId) {
        return
      }

      set({
        error: error instanceof Error ? error.message : '读取文件预览失败',
        filePreview: null,
        isFilePreviewLoading: false,
      })
    }
  },
  openProjectDialog: () => {
    set({ error: null, isProjectDialogOpen: true })
  },
  pickProjectDirectory: async () => {
    if (!isTauriEnvironment()) {
      set({ draftPath: '/Users/anner/Flowterm' })
      return
    }

    const selectedPath = await open({
      directory: true,
      multiple: false,
      title: 'Select project directory',
    })

    if (typeof selectedPath === 'string') {
      set({ draftPath: selectedPath })
    }
  },
  refreshActiveProject: async (projectId) => {
    const targetProjectId = projectId ?? get().activeProjectId

    if (!targetProjectId) {
      return
    }

    try {
      const snapshot = await refreshProjectSnapshot(targetProjectId)
      const selectedFilePath = resolveSnapshotSelection(snapshot, get().selectedFilePath)
      set({
        error: null,
        selectedFilePath,
        snapshot,
      })
      await get().fetchFilePreview(targetProjectId, selectedFilePath)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '刷新项目失败' })
    }
  },
  removeProject: async (projectId) => {
    try {
      const bootstrap = await removeProjectCommand(projectId)
      get().applyBootstrap(bootstrap)

      if (bootstrap.activeProjectId) {
        await get().attachTerminalPane(bootstrap.activeProjectId)
        await get().fetchFilePreview(
          bootstrap.activeProjectId,
          resolveSnapshotSelection(bootstrap.snapshot, get().selectedFilePath),
        )
      } else {
        set({ filePreview: null, isFilePreviewLoading: false })
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '移除项目失败' })
    }
  },
  removeTerminalPane: async (projectId, paneId) => {
    const projectState = ensureProjectTerminalState(
      get().terminalProjectStateByProject,
      projectId,
    )

    if (projectState.paneOrder.length <= 1) {
      return
    }

    const pane = projectState.panesById[paneId]

    if (!pane) {
      return
    }

    if (isTauriEnvironment()) {
      await closeTerminalCommand(pane.sessionId)
    }

    set((state) => ({
      terminalProjectStateByProject: {
        ...state.terminalProjectStateByProject,
        [projectId]: removeTerminalPaneState(
          ensureProjectTerminalState(state.terminalProjectStateByProject, projectId),
          paneId,
        ),
      },
    }))
  },
  resizeTerminal: async (sessionId, cols, rows) => {
    if (!isTauriEnvironment()) {
      return
    }

    await resizeTerminalCommand(sessionId, cols, rows)
  },
  selectFile: async (path) => {
    set({ selectedFilePath: path })
    await get().fetchFilePreview(get().activeProjectId, path)
  },
  selectProject: async (projectId) => {
    try {
      const snapshot = await activateProject(projectId)
      const selectedFilePath = resolveSnapshotSelection(snapshot, get().selectedFilePath)
      set({
        activeProjectId: projectId,
        error: null,
        filePreview: null,
        selectedFilePath,
        snapshot,
      })
      await get().attachTerminalPane(projectId)
      await get().fetchFilePreview(projectId, selectedFilePath)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '切换项目失败' })
    }
  },
  setDraftName: (value) => {
    set({ draftName: value })
  },
  setDraftPath: (value) => {
    set({ draftPath: value })
  },
  submitProject: async () => {
    const path = get().draftPath.trim()
    const name = get().draftName.trim()

    if (!path) {
      set({ error: '请选择一个项目目录' })
      return
    }

    try {
      const bootstrap = await addProjectCommand(path, name || undefined)
      get().applyBootstrap(bootstrap)
      set({
        draftName: '',
        draftPath: '',
        isProjectDialogOpen: false,
      })

      if (bootstrap.activeProjectId) {
        await get().attachTerminalPane(bootstrap.activeProjectId)
        await get().fetchFilePreview(
          bootstrap.activeProjectId,
          resolveSnapshotSelection(bootstrap.snapshot, get().selectedFilePath),
        )
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '添加项目失败' })
    }
  },
  updateTerminalState: (event) => {
    set((state) => ({
      terminalProjectStateByProject: {
        ...state.terminalProjectStateByProject,
        [event.projectId]: updateTerminalPaneState(
          ensureProjectTerminalState(state.terminalProjectStateByProject, event.projectId),
          event,
        ),
      },
    }))
  },
  writeTerminal: async (sessionId, data) => {
    if (!isTauriEnvironment()) {
      return
    }

    await writeTerminalCommand(sessionId, data)
  },
}))

function resolveSnapshotSelection(
  snapshot: ProjectSnapshot | null,
  currentSelection: string | null,
): string | null {
  if (!snapshot) {
    return null
  }

  return resolveSelectedFilePath(snapshot.files, currentSelection)
}

function ensureProjectTerminalState(
  terminalProjectStateByProject: Record<string, TerminalProjectState>,
  projectId: string,
): TerminalProjectState {
  return terminalProjectStateByProject[projectId] ?? createTerminalProjectState()
}

function createPaneId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `pane-${crypto.randomUUID()}`
  }

  return `pane-${Math.random().toString(36).slice(2, 10)}`
}

function createMockBootstrap(): AppBootstrap {
  const project: ProjectSummary = {
    changedFileCount: 3,
    hasLiveActivity: true,
    id: 'flowterm',
    name: 'flowterm-core',
    path: '/Users/anner/Flowterm',
    terminalState: 'running',
    untrackedFileCount: 1,
  }

  return {
    activeProjectId: project.id,
    projects: [project],
    snapshot: {
      backend: 'xterm',
      files: [
        { gitStatus: 'M', kind: 'file', liveStatus: 'modified', path: 'src-tauri/src/lib.rs' },
        { gitStatus: 'A', kind: 'file', liveStatus: 'added', path: 'src/App.tsx' },
        { gitStatus: '?', kind: 'file', liveStatus: 'idle', path: 'README.md' },
      ],
      project,
    },
    terminal: createMockTerminalAttachment(project.id, 'main', {
      history:
        '$ cargo check\n    Checking flowterm v0.1.0\n    Finished dev [unoptimized + debuginfo] target(s) in 1.48s\n',
      sessionId: 'session-main',
      state: 'running',
    }),
  }
}

function createMockTerminalAttachment(
  projectId: string,
  paneId: string,
  overrides?: Partial<TerminalAttachment>,
): TerminalAttachment {
  return {
    history: '',
    paneId,
    projectId,
    sessionId: `session-${paneId}`,
    shellLabel: 'zsh',
    state: 'idle',
    ...overrides,
  }
}

function createMockPreview(
  snapshot: ProjectSnapshot | null,
  path: string,
): FilePreview | null {
  const file = snapshot?.files.find((entry) => entry.path === path)

  if (!file) {
    return null
  }

  if (path === 'src-tauri/src/lib.rs') {
    return {
      path,
      mode: 'diff',
      gitStatus: file.gitStatus,
      liveStatus: file.liveStatus,
      imageDataUrl: null,
      startLine: 0,
      totalLines: 5,
      lines: [
        { kind: 'hunk', content: '@@ -1,5 +1,12 @@', oldLineNumber: null, newLineNumber: null },
        { kind: 'context', content: ' pub fn run() {', oldLineNumber: 1, newLineNumber: 1 },
        { kind: 'removed', content: '   tauri::Builder::default()', oldLineNumber: 2, newLineNumber: null },
        { kind: 'added', content: '   tauri::Builder::default()', oldLineNumber: null, newLineNumber: 2 },
        { kind: 'added', content: '     .plugin(tauri_plugin_log::Builder::default().build())', oldLineNumber: null, newLineNumber: 3 },
      ],
    }
  }

  if (path === 'src/App.tsx') {
    return {
      path,
      mode: 'diff',
      gitStatus: file.gitStatus,
      liveStatus: file.liveStatus,
      imageDataUrl: null,
      startLine: 0,
      totalLines: 4,
      lines: [
        { kind: 'hunk', content: '@@ -0,0 +1,5 @@', oldLineNumber: null, newLineNumber: null },
        { kind: 'added', content: 'export function App() {', oldLineNumber: null, newLineNumber: 1 },
        { kind: 'added', content: "  return <main className='flowterm-shell' />", oldLineNumber: null, newLineNumber: 2 },
        { kind: 'added', content: '}', oldLineNumber: null, newLineNumber: 3 },
      ],
    }
  }

  return {
    path,
    mode: 'text',
    gitStatus: file.gitStatus,
    liveStatus: file.liveStatus,
    imageDataUrl: null,
    startLine: 0,
    totalLines: 3,
    lines: [
      { kind: 'context', content: '# Flowterm', oldLineNumber: 1, newLineNumber: 1 },
      { kind: 'context', content: '', oldLineNumber: 2, newLineNumber: 2 },
      { kind: 'context', content: 'A terminal-first coding console.', oldLineNumber: 3, newLineNumber: 3 },
    ],
  }
}
