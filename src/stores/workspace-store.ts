import { open } from '@tauri-apps/plugin-dialog'
import { create } from 'zustand'

import {
  DEFAULT_KEYBINDINGS,
  readStoredKeybindings,
  storeKeybindings,
  type KeybindingAction,
  type KeyCombo,
} from '../features/workspace/keybindings'
import {
  DEFAULT_THEME_ID,
  getThemeById,
  readStoredThemeId,
  storeThemeId,
} from '../features/theme/theme-registry'
import {
  activateProject,
  addProject as addProjectCommand,
  attachTerminal,
  bootstrapApp,
  closeTerminal as closeTerminalCommand,
  createProjectEntry as createProjectEntryCommand,
  isTauriEnvironment,
  listRecentProjects as listRecentProjectsCommand,
  listTerminals,
  readFilePreview,
  readProjectWorkspace,
  refreshProjectSnapshot,
  removeProject as removeProjectCommand,
  resizeTerminal as resizeTerminalCommand,
  saveProjectWorkspace,
  writeTerminal as writeTerminalCommand,
} from '../lib/tauri'
import type {
  AgentStatusEvent,
  AppBootstrap,
  FilePreview,
  ProjectEntryKind,
  ProjectSnapshot,
  ProjectSummary,
  ProjectWorkspaceState,
  RecentProject,
  TerminalAttachment,
  TerminalStateEvent,
} from '../lib/contracts'
import {
  createProjectWorkspaceState,
  normalizeTerminalPaneSizes,
} from '../features/workspace/project-memory'
import {
  DEFAULT_TERMINAL_TYPOGRAPHY,
  normalizeTerminalTypography,
  readStoredTerminalTypography,
  storeTerminalTypography,
  type TerminalTypography,
} from '../features/workspace/terminal-preferences'
import {
  orderProjectsByTabOrder,
  readProjectTabOrder,
  reorderProjectTabOrder,
  storeProjectTabOrder,
} from '../features/workspace/project-tab-order'
import { shouldRefreshPreview } from '../features/workspace/project-refresh'
import { resolveSelectedFilePath } from '../features/workspace/selection'
import { toggleExpandedPath } from '../features/workspace/tree-expansion'
import {
  applyTerminalAttachment as applyTerminalPaneAttachment,
  aggregateTerminalState,
  createTerminalProjectState,
  removeTerminalPane as removeTerminalPaneState,
  type TerminalProjectState,
  updateAgentStatus as updateTerminalPaneAgentStatus,
  updateTerminalState as updateTerminalPaneState,
} from '../features/workspace/terminal-panes'
import { destroyTerminal } from '../features/workspace/terminal-pool'
import { clearTerminalStream } from '../features/workspace/terminal-stream'
import { createWorkspacePersistScheduler } from '../features/workspace/workspace-persist'

const MAX_TERMINAL_PANES = 8
const PREVIEW_CHUNK_SIZE = 200
const PROJECT_ACTIVATION_SETTLE_MS = 80
const workspacePersistScheduler = createWorkspacePersistScheduler()

// Deferred backend activation timer — cleared on every rapid switch,
// so only the final destination triggers IPC + persistence.
let projectActivationTimer: ReturnType<typeof setTimeout> | null = null

interface WorkspaceState {
  activeProjectId: string | null
  activeThemeId: string
  error: string | null
  filePreview: FilePreview | null
  filePreviewByCacheKey: Record<string, FilePreview | null>
  isBooting: boolean
  isFilePreviewLoading: boolean
  isProjectSwitching: boolean
  previewRequestId: number
  projectSelectionRequestId: number
  projects: ProjectSummary[]
  recentProjects: RecentProject[]
  selectedFilePath: string | null
  snapshot: ProjectSnapshot | null
  snapshotByProject: Record<string, ProjectSnapshot>
  keybindings: import('../features/workspace/keybindings').KeybindingMap
  terminalTypography: TerminalTypography
  terminalProjectStateByProject: Record<string, TerminalProjectState>
  workspaceStateByProject: Record<string, ProjectWorkspaceState>
  addTerminalPane: (projectId: string) => Promise<void>
  applyBootstrap: (bootstrap: AppBootstrap) => void
  attachTerminalPane: (projectId: string, paneId?: string) => Promise<TerminalAttachment>
  bootstrap: () => Promise<void>
  createProjectEntry: (
    projectId: string,
    path: string,
    kind: ProjectEntryKind,
  ) => Promise<void>
  fetchFilePreview: (
    projectId?: string | null,
    path?: string | null,
    options?: {
      lineCount?: number
      startLine?: number
    },
  ) => Promise<void>
  openProjectDialog: () => Promise<void>
  refreshRecentProjects: () => Promise<void>
  cycleProjectSelection: (direction: 'next' | 'previous') => Promise<void>
  hydrateKeybindings: () => void
  hydrateThemePreference: () => void
  hydrateTerminalTypography: () => void
  setKeybinding: (action: import('../features/workspace/keybindings').KeybindingAction, combos: import('../features/workspace/keybindings').KeyCombo[], scope?: import('../features/workspace/keybindings').KeybindingScope) => void
  refreshActiveProject: (
    projectId?: string,
    options?: {
      changedPaths?: string[]
    },
  ) => Promise<void>
  reorderProjects: (
    draggedProjectId: string,
    targetProjectId: string,
    position?: 'after' | 'before',
  ) => void
  removeProject: (projectId: string) => Promise<void>
  removeTerminalPane: (projectId: string, paneId: string) => Promise<void>
  resizeTerminal: (sessionId: string, cols: number, rows: number) => Promise<void>
  selectFile: (path: string) => Promise<void>
  selectProject: (projectId: string) => Promise<void>
  selectTerminalPane: (projectId: string, paneId: string) => void
  selectTheme: (themeId: string) => void
  setTerminalTypography: (value: Partial<TerminalTypography>) => void
  setActivePane: (projectId: string, paneId: string) => void
  setRailWidth: (projectId: string, width: number) => void
  setTreePathExpanded: (projectId: string, path: string, expanded: boolean) => void
  toggleSplitView: (projectId: string) => void
  setTreeExpandedPaths: (projectId: string, expandedPaths: Record<string, boolean>) => void
  updateAgentStatus: (event: AgentStatusEvent) => void
  updateTerminalPaneSizes: (projectId: string, paneSizes: number[]) => void
  updateTerminalState: (event: TerminalStateEvent) => void
  writeTerminal: (sessionId: string, data: string) => Promise<void>
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  activeProjectId: null,
  activeThemeId: DEFAULT_THEME_ID,
  error: null,
  filePreview: null,
  filePreviewByCacheKey: {},
  isBooting: true,
  isFilePreviewLoading: false,
  isProjectSwitching: false,
  previewRequestId: 0,
  projectSelectionRequestId: 0,
  projects: [],
  recentProjects: [],
  selectedFilePath: null,
  keybindings: DEFAULT_KEYBINDINGS,
  snapshot: null,
  snapshotByProject: {},
  terminalTypography: DEFAULT_TERMINAL_TYPOGRAPHY,
  terminalProjectStateByProject: {},
  workspaceStateByProject: {},
  addTerminalPane: async (projectId) => {
    const projectState = ensureProjectTerminalState(
      get().terminalProjectStateByProject,
      projectId,
    )

    if (projectState.paneOrder.length >= MAX_TERMINAL_PANES) {
      return
    }

    const paneId = createPaneId()

    // Optimistic update — terminal appears instantly before IPC completes
    set((state) => {
      const ts = ensureProjectTerminalState(state.terminalProjectStateByProject, projectId)
      const ws = ensureProjectWorkspaceState(state.workspaceStateByProject, projectId)

      return {
        terminalProjectStateByProject: {
          ...state.terminalProjectStateByProject,
          [projectId]: {
            paneOrder: [...ts.paneOrder, paneId],
            panesById: {
              ...ts.panesById,
              [paneId]: {
                agentStatus: { agent: 'unknown', phase: 'idle' },
                cwd: null,
                history: '',
                paneId,
                projectId,
                sessionId: `pending:${paneId}`,
                shellLabel: 'shell',
                state: 'idle',
              },
            },
          },
        },
        workspaceStateByProject: {
          ...state.workspaceStateByProject,
          [projectId]: {
            ...ws,
            activePaneId: paneId,
          },
        },
      }
    })

    // Background: real IPC replaces the placeholder
    await get().attachTerminalPane(projectId, paneId)
  },
  applyBootstrap: (bootstrap) => {
    const projects = resolveProjectTabOrder(bootstrap.projects)
    const selectedFilePath = resolveSnapshotSelection(
      bootstrap.snapshot,
      bootstrap.workspaceState?.selectedFilePath ?? get().selectedFilePath,
    )
    const allowedProjectIds = new Set(projects.map((project) => project.id))
    const terminalProjectStateByProject = Object.fromEntries(
      Object.entries(get().terminalProjectStateByProject).filter(([projectId]) =>
        allowedProjectIds.has(projectId),
      ),
    )
    const workspaceStateByProject = Object.fromEntries(
      Object.entries(get().workspaceStateByProject).filter(([projectId]) =>
        allowedProjectIds.has(projectId),
      ),
    )
    const snapshotByProject = Object.fromEntries(
      Object.entries(get().snapshotByProject).filter(([projectId]) =>
        allowedProjectIds.has(projectId),
      ),
    )
    const filePreviewByCacheKey = Object.fromEntries(
      Object.entries(get().filePreviewByCacheKey).filter(([cacheKey]) =>
        allowedProjectIds.has(extractProjectIdFromPreviewCacheKey(cacheKey)),
      ),
    )

    for (const terminal of bootstrap.terminals) {
      terminalProjectStateByProject[terminal.projectId] = applyTerminalPaneAttachment(
        ensureProjectTerminalState(terminalProjectStateByProject, terminal.projectId),
        terminal,
      )
    }

    if (bootstrap.activeProjectId) {
      const activeProjectId = bootstrap.activeProjectId
      const paneCount = ensureProjectTerminalState(
        terminalProjectStateByProject,
        activeProjectId,
      ).paneOrder.length
      const firstPaneId = paneCount > 0
        ? ensureProjectTerminalState(terminalProjectStateByProject, activeProjectId).paneOrder[0]
        : null
      workspaceStateByProject[activeProjectId] = {
        ...(bootstrap.workspaceState ?? createProjectWorkspaceState()),
        activePaneId: bootstrap.workspaceState?.activePaneId ?? firstPaneId,
        selectedFilePath,
        terminalPaneSizes: normalizeTerminalPaneSizes(
          bootstrap.workspaceState?.terminalPaneSizes ?? [],
          paneCount,
        ),
      }
    }

    if (bootstrap.snapshot?.project.id) {
      snapshotByProject[bootstrap.snapshot.project.id] = bootstrap.snapshot
    }

    set({
      activeProjectId: bootstrap.activeProjectId,
      error: null,
      filePreview: null,
      filePreviewByCacheKey,
      isBooting: false,
      isFilePreviewLoading: Boolean(bootstrap.activeProjectId && selectedFilePath),
      isProjectSwitching: false,
      projects,
      selectedFilePath,
      snapshot: bootstrap.snapshot,
      snapshotByProject,
      terminalProjectStateByProject,
      workspaceStateByProject,
    })
  },
  attachTerminalPane: async (projectId, paneId) => {
    const targetPaneId = paneId ?? 'main'
    const terminal = isTauriEnvironment()
      ? await attachTerminal(projectId, paneId)
      : createMockTerminalAttachment(projectId, targetPaneId)

    set((state) => {
      const previousTerminalProjectState = ensureProjectTerminalState(
        state.terminalProjectStateByProject,
        projectId,
      )
      const terminalProjectState = applyTerminalPaneAttachment(previousTerminalProjectState, terminal)
      const hasNewPane =
        previousTerminalProjectState.paneOrder.length !== terminalProjectState.paneOrder.length
      const workspaceState = ensureProjectWorkspaceState(state.workspaceStateByProject, projectId)
      const nextPaneCount = terminalProjectState.paneOrder.length

      return {
        projects: syncProjectTerminalState(
          state.projects,
          projectId,
          terminalProjectState,
        ),
        terminalProjectStateByProject: {
          ...state.terminalProjectStateByProject,
          [projectId]: terminalProjectState,
        },
        workspaceStateByProject: hasNewPane
          ? {
              ...state.workspaceStateByProject,
              [projectId]: {
                ...workspaceState,
                activePaneId: terminal.paneId,
                terminalPaneSizes: normalizeTerminalPaneSizes(
                  [],
                  nextPaneCount,
                ),
              },
            }
          : state.workspaceStateByProject,
      }
    })

    void persistProjectWorkspace(projectId, get)

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
      void get().refreshRecentProjects()

      if (bootstrap.activeProjectId && get().selectedFilePath) {
        void get().fetchFilePreview(bootstrap.activeProjectId, get().selectedFilePath)
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '初始化失败',
        isBooting: false,
      })
    }
  },
  createProjectEntry: async (projectId, path, kind) => {
    const normalizedPath = normalizeWorkspacePath(path)

    if (!normalizedPath) {
      return
    }

    try {
      const createdPath = await createProjectEntryCommand(projectId, normalizedPath, kind)

      set((state) => {
        const workspaceState = ensureProjectWorkspaceState(
          state.workspaceStateByProject,
          projectId,
        )
        const treeExpandedPaths = expandTreeForEntry(
          workspaceState.treeExpandedPaths,
          createdPath,
          kind,
        )

        return {
          error: null,
          filePreview:
            kind === 'file'
              ? getCachedFilePreview(state.filePreviewByCacheKey, projectId, createdPath)
              : state.filePreview,
          isFilePreviewLoading: kind === 'file',
          selectedFilePath:
            kind === 'file' ? createdPath : state.selectedFilePath,
          workspaceStateByProject: {
            ...state.workspaceStateByProject,
            [projectId]: {
              ...workspaceState,
              selectedFilePath:
                kind === 'file' ? createdPath : workspaceState.selectedFilePath,
              treeExpandedPaths,
            },
          },
        }
      })
      schedulePersistProjectWorkspace(projectId, get)
      await get().refreshActiveProject(projectId, { changedPaths: [createdPath] })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '创建文件树条目失败' })
      throw error
    }
  },
  fetchFilePreview: async (projectId, path, options) => {
    const targetProjectId = projectId ?? get().activeProjectId
    const targetPath = path ?? get().selectedFilePath

    if (!targetProjectId || !targetPath) {
      set({ filePreview: null, isFilePreviewLoading: false })
      return
    }

    const requestId = get().previewRequestId + 1
    const cachedPreview = getCachedFilePreview(
      get().filePreviewByCacheKey,
      targetProjectId,
      targetPath,
    )

    // Stale-while-revalidate: show cached preview instantly, fetch fresh in background
    set({
      filePreview: cachedPreview ?? get().filePreview,
      isFilePreviewLoading: !cachedPreview,
      previewRequestId: requestId,
    })

    try {
      const preview = isTauriEnvironment()
        ? await readFilePreview(targetProjectId, targetPath, {
            lineCount: options?.lineCount ?? PREVIEW_CHUNK_SIZE,
            startLine: options?.startLine ?? 0,
          })
        : createMockPreview(get().snapshot, targetPath)

      const state = get()
      const cacheKey = createPreviewCacheKey(targetProjectId, targetPath)

      set((currentState) => ({
        filePreviewByCacheKey: {
          ...currentState.filePreviewByCacheKey,
          [cacheKey]: preview,
        },
      }))

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
        filePreview: cachedPreview,
        isFilePreviewLoading: false,
      })
    }
  },
  openProjectDialog: async () => {
    set({ error: null })

    if (!isTauriEnvironment()) {
      const mockPath = '/Users/anner/Flowterm'

      try {
        const bootstrap = await addProjectCommand(
          mockPath,
          inferProjectNameFromPath(mockPath),
        )
        get().applyBootstrap(bootstrap)

        if (bootstrap.activeProjectId && get().selectedFilePath) {
          void get().fetchFilePreview(bootstrap.activeProjectId, get().selectedFilePath)
        }
      } catch (error) {
        set({ error: error instanceof Error ? error.message : '添加项目失败' })
      }

      return
    }

    const selectedPath = await open({
      directory: true,
      multiple: false,
      title: '选择项目目录',
    })

    if (typeof selectedPath !== 'string') {
      return
    }

    const path = selectedPath.trim()

    if (!path) {
      return
    }

    try {
      const bootstrap = await addProjectCommand(path, inferProjectNameFromPath(path) || undefined)
      get().applyBootstrap(bootstrap)
      void get().refreshRecentProjects()

      if (bootstrap.activeProjectId && get().selectedFilePath) {
        void get().fetchFilePreview(bootstrap.activeProjectId, get().selectedFilePath)
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '添加项目失败' })
    }
  },
  refreshRecentProjects: async () => {
    if (!isTauriEnvironment()) {
      return
    }

    try {
      const recentProjects = await listRecentProjectsCommand()
      set({ recentProjects })
    } catch {
      // silent — non-critical
    }
  },
  hydrateKeybindings: () => {
    set({ keybindings: readStoredKeybindings() })
  },
  hydrateThemePreference: () => {
    set({ activeThemeId: readStoredThemeId() })
  },
  hydrateTerminalTypography: () => {
    set({ terminalTypography: readStoredTerminalTypography() })
  },
  setKeybinding: (action: KeybindingAction, combos: KeyCombo[], scope?: import('../features/workspace/keybindings').KeybindingScope) => {
    const current = get().keybindings[action]
    const next = { ...get().keybindings, [action]: { combos, scope: scope ?? current.scope } }
    storeKeybindings(next)
    set({ keybindings: next })
  },
  cycleProjectSelection: async (direction) => {
    const { activeProjectId, projects } = get()

    if (!activeProjectId || projects.length <= 1) {
      return
    }

    const activeProjectIndex = projects.findIndex((project) => project.id === activeProjectId)

    if (activeProjectIndex < 0) {
      return
    }

    const nextProjectIndex =
      direction === 'next'
        ? (activeProjectIndex + 1) % projects.length
        : (activeProjectIndex - 1 + projects.length) % projects.length
    const nextProjectId = projects[nextProjectIndex]?.id

    if (!nextProjectId || nextProjectId === activeProjectId) {
      return
    }

    await get().selectProject(nextProjectId)
  },
  refreshActiveProject: async (projectId, options) => {
    const targetProjectId = projectId ?? get().activeProjectId

    if (!targetProjectId) {
      return
    }

    try {
      const previousSelectedFilePath = get().selectedFilePath
      const snapshot = await refreshProjectSnapshot(targetProjectId)
      const workspaceState = ensureProjectWorkspaceState(
        get().workspaceStateByProject,
        targetProjectId,
      )
      const selectedFilePath = resolveSnapshotSelection(
        snapshot,
        workspaceState.selectedFilePath,
      )
      const previewShouldRefresh = shouldRefreshPreview({
        changedPaths: options?.changedPaths,
        nextSelectedFilePath: selectedFilePath,
        previousSelectedFilePath,
      })

      set((state) => ({
        error: null,
        filePreview: getCachedFilePreview(
          state.filePreviewByCacheKey,
          targetProjectId,
          selectedFilePath,
        ),
        isFilePreviewLoading: previewShouldRefresh,
        projects: replaceProjectSummary(state.projects, snapshot.project),
        selectedFilePath,
        snapshot,
        snapshotByProject: {
          ...state.snapshotByProject,
          [targetProjectId]: snapshot,
        },
        workspaceStateByProject: {
          ...state.workspaceStateByProject,
          [targetProjectId]: {
            ...workspaceState,
            selectedFilePath,
          },
        },
      }))
      void persistProjectWorkspace(targetProjectId, get)

      if (previewShouldRefresh) {
        void get().fetchFilePreview(targetProjectId, selectedFilePath)
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '刷新项目失败' })
    }
  },
  reorderProjects: (draggedProjectId, targetProjectId, position = 'before') => {
    set((state) => {
      const nextProjectIds = reorderProjectTabOrder(
        state.projects.map((project) => project.id),
        draggedProjectId,
        targetProjectId,
        position,
      )
      const nextProjects = orderProjectsByTabOrder(state.projects, nextProjectIds)

      storeProjectTabOrder(nextProjectIds)

      return {
        projects: nextProjects,
      }
    })
  },
  removeProject: async (projectId) => {
    try {
      const bootstrap = await removeProjectCommand(projectId)
      get().applyBootstrap(bootstrap)

      if (bootstrap.activeProjectId && get().selectedFilePath) {
        void get().fetchFilePreview(bootstrap.activeProjectId, get().selectedFilePath)
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
      await closeTerminalCommand(projectId, pane.sessionId)
    }

    destroyTerminal(pane.sessionId)
    clearTerminalStream(pane.sessionId)

    // Determine the previous pane before removing
    const closedIndex = projectState.paneOrder.indexOf(paneId)

    set((state) => {
      const terminalProjectState = removeTerminalPaneState(
        ensureProjectTerminalState(state.terminalProjectStateByProject, projectId),
        paneId,
      )
      const workspaceState = ensureProjectWorkspaceState(
        state.workspaceStateByProject,
        projectId,
      )

      let nextActivePaneId = workspaceState.activePaneId
      if (workspaceState.activePaneId === paneId) {
        // Prefer the pane just before the closed one, fall back to first
        const prevIndex = Math.max(0, closedIndex - 1)
        nextActivePaneId = terminalProjectState.paneOrder[prevIndex] ?? null
      }

      return {
        projects: syncProjectTerminalState(
          state.projects,
          projectId,
          terminalProjectState,
        ),
        terminalProjectStateByProject: {
          ...state.terminalProjectStateByProject,
          [projectId]: terminalProjectState,
        },
        workspaceStateByProject: {
          ...state.workspaceStateByProject,
          [projectId]: {
            ...workspaceState,
            activePaneId: nextActivePaneId,
            terminalPaneSizes: normalizeTerminalPaneSizes(
              workspaceState.terminalPaneSizes,
              terminalProjectState.paneOrder.length,
            ),
          },
        },
      }
    })
    void persistProjectWorkspace(projectId, get)
  },
  resizeTerminal: async (sessionId, cols, rows) => {
    if (!isTauriEnvironment()) {
      return
    }

    await resizeTerminalCommand(sessionId, cols, rows)
  },
  selectFile: async (path) => {
    const projectId = get().activeProjectId

    if (!projectId) {
      return
    }

    const cachedPreview = getCachedFilePreview(
      get().filePreviewByCacheKey,
      projectId,
      path,
    )

    set((state) => ({
      filePreview: cachedPreview,
      isFilePreviewLoading: !cachedPreview,
      selectedFilePath: path,
      workspaceStateByProject: {
        ...state.workspaceStateByProject,
        [projectId]: {
          ...ensureProjectWorkspaceState(state.workspaceStateByProject, projectId),
          selectedFilePath: path,
        },
      },
    }))
    void persistProjectWorkspace(projectId, get)
    await get().fetchFilePreview(projectId, path)
  },
  selectProject: async (projectId) => {
    const previousState = get()

    if (
      previousState.activeProjectId === projectId &&
      previousState.snapshot?.project.id === projectId &&
      !previousState.isProjectSwitching
    ) {
      return
    }

    const requestId = previousState.projectSelectionRequestId + 1
    const cachedSnapshot = previousState.snapshotByProject[projectId] ?? null
    const cachedWorkspaceState = ensureProjectWorkspaceState(
      previousState.workspaceStateByProject,
      projectId,
    )
    const cachedSelectedFilePath = resolveSnapshotSelection(
      cachedSnapshot,
      cachedWorkspaceState.selectedFilePath,
    )
    const cachedFilePreview = getCachedFilePreview(
      previousState.filePreviewByCacheKey,
      projectId,
      cachedSelectedFilePath,
    )
    const hasCachedWorkspaceState = projectId in previousState.workspaceStateByProject
    const hasCachedTerminalState = projectId in previousState.terminalProjectStateByProject
    const shouldReuseHydratedProjectState =
      Boolean(cachedSnapshot) && hasCachedWorkspaceState && hasCachedTerminalState

    // Cancel any pending deferred activation from a previous rapid switch
    if (projectActivationTimer) {
      clearTimeout(projectActivationTimer)
      projectActivationTimer = null
    }

    // INSTANT: apply cached state — UI updates synchronously, zero async work
    set({
      activeProjectId: projectId,
      error: null,
      filePreview: cachedFilePreview,
      isFilePreviewLoading: Boolean(cachedSelectedFilePath && !cachedFilePreview),
      isProjectSwitching: false,
      projectSelectionRequestId: requestId,
      selectedFilePath: cachedSelectedFilePath,
      snapshot: cachedSnapshot,
    })

    // ── Fast path: fully cached project ──
    // Everything is in memory — return immediately so rapid Cmd+Arrow
    // cycling stays synchronous. Backend sync deferred until the user settles.
    if (shouldReuseHydratedProjectState) {
      projectActivationTimer = setTimeout(() => {
        projectActivationTimer = null
        const settled = get()

        if (
          settled.projectSelectionRequestId !== requestId ||
          settled.activeProjectId !== projectId
        ) {
          return
        }

        void persistProjectWorkspace(projectId, get)

        void activateProject(projectId)
          .then((snapshot) => {
            const after = get()

            if (
              after.projectSelectionRequestId !== requestId ||
              after.activeProjectId !== projectId
            ) {
              return
            }

            const selectedFilePath = resolveSnapshotSelection(
              snapshot,
              cachedWorkspaceState.selectedFilePath,
            )

            set((s) => {
              const freshPreview = getCachedFilePreview(
                s.filePreviewByCacheKey,
                projectId,
                selectedFilePath,
              )

              return {
                filePreview: freshPreview,
                isFilePreviewLoading: Boolean(selectedFilePath && !freshPreview),
                projects: replaceProjectSummary(s.projects, snapshot.project),
                selectedFilePath,
                snapshot,
                snapshotByProject: {
                  ...s.snapshotByProject,
                  [projectId]: snapshot,
                },
              }
            })

            void get().fetchFilePreview(projectId, selectedFilePath)
          })
          .catch(() => {})
      }, PROJECT_ACTIVATION_SETTLE_MS)

      return
    }

    // ── Cold path: first visit to this project ──
    // Must await backend to load snapshot, workspace state, and terminals.
    try {
      const [snapshot, workspaceState, terminals] = await Promise.all([
        activateProject(projectId),
        isTauriEnvironment()
          ? readProjectWorkspace(projectId)
          : Promise.resolve(createProjectWorkspaceState()),
        isTauriEnvironment()
          ? listTerminals(projectId)
          : Promise.resolve([createMockTerminalAttachment(projectId, 'main')]),
      ])
      const terminalProjectState = terminals.reduce(
        (state, terminal) => applyTerminalPaneAttachment(state, terminal),
        createTerminalProjectState(),
      )
      const selectedFilePath = resolveSnapshotSelection(
        snapshot,
        workspaceState.selectedFilePath,
      )
      const firstPaneId = terminalProjectState.paneOrder[0] ?? null

      const currentState = get()

      if (
        currentState.projectSelectionRequestId !== requestId ||
        currentState.activeProjectId !== projectId
      ) {
        return
      }

      const coldCachedPreview = getCachedFilePreview(
        currentState.filePreviewByCacheKey,
        projectId,
        selectedFilePath,
      )

      set({
        activeProjectId: projectId,
        error: null,
        filePreview: coldCachedPreview,
        isFilePreviewLoading: Boolean(selectedFilePath && !coldCachedPreview),
        isProjectSwitching: false,
        projects: replaceProjectSummary(currentState.projects, snapshot.project),
        selectedFilePath,
        snapshot,
        snapshotByProject: {
          ...currentState.snapshotByProject,
          [projectId]: snapshot,
        },
        terminalProjectStateByProject: {
          ...currentState.terminalProjectStateByProject,
          [projectId]: terminalProjectState,
        },
        workspaceStateByProject: {
          ...currentState.workspaceStateByProject,
          [projectId]: {
            ...workspaceState,
            activePaneId: workspaceState.activePaneId ?? firstPaneId,
            selectedFilePath,
            terminalPaneSizes: normalizeTerminalPaneSizes(
              workspaceState.terminalPaneSizes,
              terminalProjectState.paneOrder.length,
            ),
          },
        },
      })
      void persistProjectWorkspace(projectId, get)
      void get().fetchFilePreview(projectId, selectedFilePath)
    } catch (error) {
      const currentState = get()

      if (currentState.projectSelectionRequestId !== requestId) {
        return
      }

      set({
        activeProjectId: previousState.activeProjectId,
        error: error instanceof Error ? error.message : '切换项目失败',
        filePreview: previousState.filePreview,
        isFilePreviewLoading: previousState.isFilePreviewLoading,
        isProjectSwitching: false,
        selectedFilePath: previousState.selectedFilePath,
        snapshot: previousState.snapshot,
      })
    }
  },
  selectTheme: (themeId) => {
    const nextTheme = getThemeById(themeId)

    storeThemeId(nextTheme.id)
    set({ activeThemeId: nextTheme.id })
  },
  setTerminalTypography: (value) => {
    const nextTypography = normalizeTerminalTypography({
      ...get().terminalTypography,
      ...value,
    })

    storeTerminalTypography(nextTypography)
    set({ terminalTypography: nextTypography })
  },
  selectTerminalPane: (projectId, paneId) => {
    set((state) => ({
      workspaceStateByProject: {
        ...state.workspaceStateByProject,
        [projectId]: {
          ...ensureProjectWorkspaceState(state.workspaceStateByProject, projectId),
          activePaneId: paneId,
        },
      },
    }))
    void persistProjectWorkspace(projectId, get)
  },
  setActivePane: (projectId, paneId) => {
    set((state) => ({
      workspaceStateByProject: {
        ...state.workspaceStateByProject,
        [projectId]: {
          ...ensureProjectWorkspaceState(state.workspaceStateByProject, projectId),
          activePaneId: paneId,
        },
      },
    }))
    void persistProjectWorkspace(projectId, get)
  },
  setRailWidth: (projectId, width) => {
    set((state) => ({
      workspaceStateByProject: {
        ...state.workspaceStateByProject,
        [projectId]: {
          ...ensureProjectWorkspaceState(state.workspaceStateByProject, projectId),
          railWidth: Math.max(44, Math.min(240, width)),
        },
      },
    }))
    void persistProjectWorkspace(projectId, get)
  },
  toggleSplitView: (projectId) => {
    set((state) => {
      const workspaceState = ensureProjectWorkspaceState(
        state.workspaceStateByProject,
        projectId,
      )
      return {
        workspaceStateByProject: {
          ...state.workspaceStateByProject,
          [projectId]: {
            ...workspaceState,
            isSplitView: !workspaceState.isSplitView,
          },
        },
      }
    })
    void persistProjectWorkspace(projectId, get)
  },
  setTreePathExpanded: (projectId, path, expanded) => {
    set((state) => {
      const workspaceState = ensureProjectWorkspaceState(
        state.workspaceStateByProject,
        projectId,
      )
      const nextExpandedPaths = toggleExpandedPath(
        workspaceState.treeExpandedPaths,
        path,
        expanded,
      )

      if (nextExpandedPaths === workspaceState.treeExpandedPaths) {
        return state
      }

      return {
        workspaceStateByProject: {
          ...state.workspaceStateByProject,
          [projectId]: {
            ...workspaceState,
            treeExpandedPaths: nextExpandedPaths,
          },
        },
      }
    })
    schedulePersistProjectWorkspace(projectId, get)
  },
  setTreeExpandedPaths: (projectId, expandedPaths) => {
    set((state) => ({
      workspaceStateByProject: {
        ...state.workspaceStateByProject,
        [projectId]: {
          ...ensureProjectWorkspaceState(state.workspaceStateByProject, projectId),
          treeExpandedPaths: expandedPaths,
        },
      },
    }))
    schedulePersistProjectWorkspace(projectId, get)
  },
  updateAgentStatus: (event) => {
    set((state) => {
      const prev = ensureProjectTerminalState(state.terminalProjectStateByProject, event.projectId)
      const next = updateTerminalPaneAgentStatus(prev, event)
      if (next === prev) return state
      return {
        terminalProjectStateByProject: {
          ...state.terminalProjectStateByProject,
          [event.projectId]: next,
        },
      }
    })
  },
  updateTerminalPaneSizes: (projectId, paneSizes) => {
    const paneCount = ensureProjectTerminalState(
      get().terminalProjectStateByProject,
      projectId,
    ).paneOrder.length
    set((state) => ({
      workspaceStateByProject: {
        ...state.workspaceStateByProject,
        [projectId]: {
          ...ensureProjectWorkspaceState(state.workspaceStateByProject, projectId),
          terminalPaneSizes: normalizeTerminalPaneSizes(paneSizes, paneCount),
        },
      },
    }))
    void persistProjectWorkspace(projectId, get)
  },
  updateTerminalState: (event) => {
    if (event.state === 'exited') {
      const prevPaneOrder = ensureProjectTerminalState(
        get().terminalProjectStateByProject,
        event.projectId,
      ).paneOrder
      const closedIndex = prevPaneOrder.indexOf(event.paneId)

      destroyTerminal(event.sessionId)
      clearTerminalStream(event.sessionId)
      set((state) => {
        const terminalProjectState = removeTerminalPaneState(
          ensureProjectTerminalState(state.terminalProjectStateByProject, event.projectId),
          event.paneId,
        )
        const workspaceState = ensureProjectWorkspaceState(
          state.workspaceStateByProject,
          event.projectId,
        )

        let nextActivePaneId = workspaceState.activePaneId
        if (workspaceState.activePaneId === event.paneId) {
          const prevIndex = Math.max(0, closedIndex - 1)
          nextActivePaneId = terminalProjectState.paneOrder[prevIndex] ?? null
        }

        return {
          projects: syncProjectTerminalState(
            state.projects,
            event.projectId,
            terminalProjectState,
          ),
          terminalProjectStateByProject: {
            ...state.terminalProjectStateByProject,
            [event.projectId]: terminalProjectState,
          },
          workspaceStateByProject: {
            ...state.workspaceStateByProject,
            [event.projectId]: {
              ...workspaceState,
              activePaneId: nextActivePaneId,
              terminalPaneSizes: normalizeTerminalPaneSizes(
                workspaceState.terminalPaneSizes,
                terminalProjectState.paneOrder.length,
              ),
            },
          },
        }
      })
      void persistProjectWorkspace(event.projectId, get)

      // If the last terminal exited, auto-create a replacement
      const currentPaneOrder = ensureProjectTerminalState(
        get().terminalProjectStateByProject,
        event.projectId,
      ).paneOrder
      if (currentPaneOrder.length === 0) {
        void get().addTerminalPane(event.projectId)
      }

      return
    }

    set((state) => {
      const prev = ensureProjectTerminalState(state.terminalProjectStateByProject, event.projectId)
      const next = updateTerminalPaneState(prev, event)
      if (next === prev) return state
      return {
        projects: syncProjectTerminalState(state.projects, event.projectId, next),
        terminalProjectStateByProject: {
          ...state.terminalProjectStateByProject,
          [event.projectId]: next,
        },
      }
    })
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

function ensureProjectWorkspaceState(
  workspaceStateByProject: Record<string, ProjectWorkspaceState>,
  projectId: string,
): ProjectWorkspaceState {
  return workspaceStateByProject[projectId] ?? createProjectWorkspaceState()
}

function replaceProjectSummary(
  projects: ProjectSummary[],
  summary: ProjectSummary,
): ProjectSummary[] {
  let found = false
  const nextProjects = projects.map((project) => {
    if (project.id !== summary.id) {
      return project
    }

    found = true
    return summary
  })

  return found ? nextProjects : [...nextProjects, summary]
}

function createPreviewCacheKey(projectId: string, path: string): string {
  return `${projectId}::${path}`
}

function extractProjectIdFromPreviewCacheKey(cacheKey: string): string {
  return cacheKey.split('::', 1)[0] ?? ''
}

function getCachedFilePreview(
  filePreviewByCacheKey: Record<string, FilePreview | null>,
  projectId: string,
  path: string | null,
): FilePreview | null {
  if (!path) {
    return null
  }

  return filePreviewByCacheKey[createPreviewCacheKey(projectId, path)] ?? null
}


function resolveProjectTabOrder(projects: ProjectSummary[]): ProjectSummary[] {
  const storedProjectTabOrder = readProjectTabOrder()
  const orderedProjects = orderProjectsByTabOrder(projects, storedProjectTabOrder)

  storeProjectTabOrder(orderedProjects.map((project) => project.id))

  return orderedProjects
}

function syncProjectTerminalState(
  projects: ProjectSummary[],
  projectId: string,
  terminalProjectState: TerminalProjectState,
): ProjectSummary[] {
  const terminalState = aggregateTerminalState(terminalProjectState)
  const target = projects.find((p) => p.id === projectId)
  if (target && target.terminalState === terminalState) return projects

  return projects.map((project) =>
    project.id === projectId
      ? {
          ...project,
          terminalState,
        }
      : project,
  )
}

async function persistProjectWorkspace(
  projectId: string,
  get: () => WorkspaceState,
): Promise<void> {
  if (!isTauriEnvironment()) {
    return
  }

  const workspaceState = ensureProjectWorkspaceState(
    get().workspaceStateByProject,
    projectId,
  )

  await saveProjectWorkspace(projectId, workspaceState)
}

function schedulePersistProjectWorkspace(
  projectId: string,
  get: () => WorkspaceState,
): void {
  workspacePersistScheduler.schedule(projectId, () =>
    persistProjectWorkspace(projectId, get),
  )
}

function createPaneId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `pane-${crypto.randomUUID()}`
  }

  return `pane-${Math.random().toString(36).slice(2, 10)}`
}

function expandTreeForEntry(
  expandedPaths: Record<string, boolean>,
  path: string,
  kind: ProjectEntryKind,
): Record<string, boolean> {
  const segments = normalizeWorkspacePath(path)
    .split('/')
    .filter(Boolean)
  const folderSegments = kind === 'folder' ? segments : segments.slice(0, -1)

  if (folderSegments.length === 0) {
    return expandedPaths
  }

  let nextExpandedPaths = expandedPaths
  const activeSegments: string[] = []

  for (const segment of folderSegments) {
    activeSegments.push(segment)
    const folderPath = activeSegments.join('/')

    if (nextExpandedPaths[folderPath]) {
      continue
    }

    nextExpandedPaths = {
      ...nextExpandedPaths,
      [folderPath]: true,
    }
  }

  return nextExpandedPaths
}

function inferProjectNameFromPath(path: string): string {
  const normalizedPath = path.replaceAll('\\', '/').replace(/\/+$/, '')

  if (!normalizedPath) {
    return ''
  }

  const segments = normalizedPath.split('/')

  return segments[segments.length - 1] ?? ''
}

function normalizeWorkspacePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
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
    terminals: [
      createMockTerminalAttachment(project.id, 'main', {
        cwd: project.path,
        history:
          '$ pwd\n/Users/anner/Flowterm\n$ git status --short\n M src/App.tsx\n',
        sessionId: 'session-main',
        state: 'running',
      }),
    ],
    workspaceState: {
      activePaneId: 'main',
      isSplitView: true,
      railWidth: 44,
      selectedFilePath: 'src/App.tsx',
      terminalPaneSizes: [100],
      treeExpandedPaths: {},
    },
  }
}

function createMockTerminalAttachment(
  projectId: string,
  paneId: string,
  overrides?: Partial<TerminalAttachment>,
): TerminalAttachment {
  return {
    agentStatus: {
      agent: 'unknown',
      phase: 'idle',
    },
    cwd: null,
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
