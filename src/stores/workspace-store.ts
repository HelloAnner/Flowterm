import { open } from '@tauri-apps/plugin-dialog'
import { create } from 'zustand'

import {
  activateProject,
  addProject as addProjectCommand,
  attachTerminal,
  bootstrapApp,
  isTauriEnvironment,
  refreshProjectSnapshot,
  removeProject as removeProjectCommand,
  resizeTerminal as resizeTerminalCommand,
  writeTerminal as writeTerminalCommand,
} from '../lib/tauri'
import type {
  AppBootstrap,
  FileDiff,
  ProjectSnapshot,
  ProjectSummary,
  TerminalAttachment,
  TerminalOutputEvent,
  TerminalState,
  TerminalStateEvent,
} from '../lib/contracts'

type DiffMode = 'git' | 'live'

interface WorkspaceState {
  activeProjectId: string | null
  diffMode: DiffMode
  draftName: string
  draftPath: string
  error: string | null
  isBooting: boolean
  isProjectDialogOpen: boolean
  lastTerminalEvent: TerminalOutputEvent | null
  projects: ProjectSummary[]
  selectedFilePath: string | null
  snapshot: ProjectSnapshot | null
  terminalHistoryByProject: Record<string, string>
  terminalShellLabelByProject: Record<string, string>
  terminalStateByProject: Record<string, TerminalState>
  applyBootstrap: (bootstrap: AppBootstrap) => void
  appendTerminalChunk: (event: TerminalOutputEvent) => void
  attachActiveTerminal: (projectId: string) => Promise<void>
  bootstrap: () => Promise<void>
  closeProjectDialog: () => void
  openProjectDialog: () => void
  pickProjectDirectory: () => Promise<void>
  refreshActiveProject: (projectId?: string) => Promise<void>
  removeProject: (projectId: string) => Promise<void>
  resizeTerminal: (projectId: string, cols: number, rows: number) => Promise<void>
  selectFile: (path: string) => void
  selectProject: (projectId: string) => Promise<void>
  setDiffMode: (mode: DiffMode) => void
  setDraftName: (value: string) => void
  setDraftPath: (value: string) => void
  submitProject: () => Promise<void>
  updateTerminalState: (event: TerminalStateEvent) => void
  writeTerminal: (projectId: string, data: string) => Promise<void>
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  activeProjectId: null,
  diffMode: 'live',
  draftName: '',
  draftPath: '',
  error: null,
  isBooting: true,
  isProjectDialogOpen: false,
  lastTerminalEvent: null,
  projects: [],
  selectedFilePath: null,
  snapshot: null,
  terminalHistoryByProject: {},
  terminalShellLabelByProject: {},
  terminalStateByProject: {},
  applyBootstrap: (bootstrap) => {
    const terminalHistoryByProject = { ...get().terminalHistoryByProject }
    const terminalShellLabelByProject = { ...get().terminalShellLabelByProject }
    const terminalStateByProject = { ...get().terminalStateByProject }

    if (bootstrap.terminal) {
      terminalHistoryByProject[bootstrap.terminal.projectId] = bootstrap.terminal.history
      terminalShellLabelByProject[bootstrap.terminal.projectId] = bootstrap.terminal.shellLabel
      terminalStateByProject[bootstrap.terminal.projectId] = bootstrap.terminal.state
    }

    set({
      activeProjectId: bootstrap.activeProjectId,
      error: null,
      isBooting: false,
      projects: bootstrap.projects,
      selectedFilePath: resolveSelectedFile(
        bootstrap.snapshot,
        get().selectedFilePath,
      ),
      snapshot: bootstrap.snapshot,
      terminalHistoryByProject,
      terminalShellLabelByProject,
      terminalStateByProject,
    })
  },
  appendTerminalChunk: (event) => {
    const history = get().terminalHistoryByProject[event.projectId] ?? ''

    set((state) => ({
      lastTerminalEvent: event,
      terminalHistoryByProject: {
        ...state.terminalHistoryByProject,
        [event.projectId]: `${history}${event.chunk}`,
      },
      terminalStateByProject: {
        ...state.terminalStateByProject,
        [event.projectId]: 'running',
      },
    }))
  },
  attachActiveTerminal: async (projectId) => {
    const terminal = await attachTerminal(projectId)
    set((state) => applyTerminalAttachment(state, terminal))
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
        await get().attachActiveTerminal(bootstrap.activeProjectId)
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
      set({
        error: null,
        selectedFilePath: resolveSelectedFile(snapshot, get().selectedFilePath),
        snapshot,
      })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '刷新项目失败' })
    }
  },
  removeProject: async (projectId) => {
    try {
      const bootstrap = await removeProjectCommand(projectId)
      get().applyBootstrap(bootstrap)

      if (bootstrap.activeProjectId) {
        await get().attachActiveTerminal(bootstrap.activeProjectId)
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '移除项目失败' })
    }
  },
  resizeTerminal: async (projectId, cols, rows) => {
    if (!isTauriEnvironment()) {
      return
    }

    await resizeTerminalCommand(projectId, cols, rows)
  },
  selectFile: (path) => {
    set({ selectedFilePath: path })
  },
  selectProject: async (projectId) => {
    try {
      const snapshot = await activateProject(projectId)
      set({
        activeProjectId: projectId,
        error: null,
        selectedFilePath: resolveSelectedFile(snapshot, get().selectedFilePath),
        snapshot,
      })
      await get().attachActiveTerminal(projectId)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '切换项目失败' })
    }
  },
  setDiffMode: (mode) => {
    set({ diffMode: mode })
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
        await get().attachActiveTerminal(bootstrap.activeProjectId)
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '添加项目失败' })
    }
  },
  updateTerminalState: (event) => {
    set((state) => ({
      terminalStateByProject: {
        ...state.terminalStateByProject,
        [event.projectId]: event.state,
      },
    }))
  },
  writeTerminal: async (projectId, data) => {
    if (!isTauriEnvironment()) {
      return
    }

    await writeTerminalCommand(projectId, data)
  },
}))

function resolveSelectedFile(
  snapshot: ProjectSnapshot | null,
  currentSelection: string | null,
): string | null {
  if (!snapshot) {
    return null
  }

  const availablePaths = new Set(snapshot.gitDiffs.map((diff) => diff.path))

  if (currentSelection && availablePaths.has(currentSelection)) {
    return currentSelection
  }

  return snapshot.gitDiffs[0]?.path ?? snapshot.files[0]?.path ?? null
}

function applyTerminalAttachment(
  state: WorkspaceState,
  terminal: TerminalAttachment,
): Partial<WorkspaceState> {
  return {
    terminalHistoryByProject: {
      ...state.terminalHistoryByProject,
      [terminal.projectId]: terminal.history,
    },
    terminalShellLabelByProject: {
      ...state.terminalShellLabelByProject,
      [terminal.projectId]: terminal.shellLabel,
    },
    terminalStateByProject: {
      ...state.terminalStateByProject,
      [terminal.projectId]: terminal.state,
    },
  }
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

  const liveDiffs: FileDiff[] = [
    {
      changeType: 'modified',
      path: 'src-tauri/src/lib.rs',
      lines: [
        { kind: 'hunk', content: '@@ -1,5 +1,12 @@', oldLineNumber: null, newLineNumber: null },
        { kind: 'context', content: ' pub fn run() {', oldLineNumber: 1, newLineNumber: 1 },
        { kind: 'removed', content: '   tauri::Builder::default()', oldLineNumber: 2, newLineNumber: null },
        { kind: 'added', content: '   tauri::Builder::default()', oldLineNumber: null, newLineNumber: 2 },
        { kind: 'added', content: '     .plugin(tauri_plugin_log::Builder::default().build())', oldLineNumber: null, newLineNumber: 3 },
      ],
    },
    {
      changeType: 'untracked',
      path: 'src/App.tsx',
      lines: [
        { kind: 'hunk', content: '@@ -0,0 +1,5 @@', oldLineNumber: null, newLineNumber: null },
        { kind: 'added', content: 'export function App() {', oldLineNumber: null, newLineNumber: 1 },
        { kind: 'added', content: "  return <main className='flowterm-shell' />", oldLineNumber: null, newLineNumber: 2 },
        { kind: 'added', content: '}', oldLineNumber: null, newLineNumber: 3 },
      ],
    },
  ]

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
      gitDiffs: liveDiffs,
      liveDiffs,
      project,
    },
    terminal: {
      history:
        '$ cargo check\n    Checking flowterm v0.1.0\n    Finished dev [unoptimized + debuginfo] target(s) in 1.48s\n',
      projectId: project.id,
      shellLabel: 'zsh',
      state: 'running',
    },
  }
}
