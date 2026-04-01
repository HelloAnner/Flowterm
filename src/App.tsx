import {
  lazy,
  Suspense,
  useCallback,
  type ReactElement,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from 'react-resizable-panels'

import { WorkspaceFileTree } from './components/workspace-file-tree'
import { CommandPalette } from './components/command-palette'
import {
  WorkspaceSidebar,
  type WorkspaceSidebarView,
} from './components/workspace-sidebar'
import {
  WorkspaceSettings,
  type WorkspaceSettingsSection,
} from './components/workspace-settings'
import { WorkspaceTabBar } from './components/workspace-tab-bar'
import {
  applyThemeToDocument,
  getThemeById,
} from './features/theme/theme-registry'
import { orderProjectsByRecency } from './features/workspace/project-recents'
import {
  buildTerminalPaneDescriptors,
  createTerminalProjectState,
} from './features/workspace/terminal-panes'
import { publishTerminalOutput } from './features/workspace/terminal-stream'
import { scheduleIdleTask } from './features/workspace/idle-task'
import { maybeStartPerformanceProbe } from './e2e/performance-probe'
import {
  isTauriEnvironment,
  listenAgentStatus,
  listenProjectRefresh,
  listenTerminalOutput,
  listenTerminalState,
  writeProjectFile,
} from './lib/tauri'
import type { ProjectFileEntry } from './lib/contracts'
import { useKnowledgeStore } from './stores/knowledge-store'
import { useWorkspaceStore } from './stores/workspace-store'

const EMPTY_TERMINAL_PROJECT_STATE = createTerminalProjectState()
const EMPTY_EXPANDED_PATHS: Record<string, boolean> = {}
const EMPTY_PANE_SIZES: number[] = []
const KnowledgeBoard = lazy(async () => ({
  default: (await import('./components/knowledge-board')).KnowledgeBoard,
}))
const WorkspaceDiffPanel = lazy(async () => ({
  default: (await import('./components/workspace-diff-panel')).WorkspaceDiffPanel,
}))
const WorkspaceTerminal = lazy(async () => ({
  default: (await import('./components/workspace-terminal')).WorkspaceTerminal,
}))

function App(): ReactElement {
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [previewThemeId, setPreviewThemeId] = useState<string | null>(null)
  const [workspaceSettingsSection, setWorkspaceSettingsSection] =
    useState<WorkspaceSettingsSection>('appearance')
  const [workspaceSidebarView, setWorkspaceSidebarView] =
    useState<WorkspaceSidebarView>('tree')

  // Core app state — only what App itself needs for routing and layout
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId)
  const activeThemeId = useWorkspaceStore((s) => s.activeThemeId)
  const bootstrap = useWorkspaceStore((s) => s.bootstrap)
  const error = useWorkspaceStore((s) => s.error)
  const isBooting = useWorkspaceStore((s) => s.isBooting)
  const projects = useWorkspaceStore((s) => s.projects)
  const recentProjectIds = useWorkspaceStore((s) => s.recentProjectIds)
  const snapshot = useWorkspaceStore((s) => s.snapshot)
  const terminalTypography = useWorkspaceStore((s) => s.terminalTypography)

  // Knowledge board
  const knowledgeCards = useKnowledgeStore((s) => s.cards)
  const hydrateKnowledge = useKnowledgeStore((s) => s.hydrateFromStorage)
  const projectCardCount = useMemo(
    () =>
      activeProjectId
        ? knowledgeCards.filter((c) => c.projectId === activeProjectId).length
        : knowledgeCards.length,
    [knowledgeCards, activeProjectId],
  )

  // Store actions (stable references — never trigger re-renders)
  const addTerminalPane = useWorkspaceStore((s) => s.addTerminalPane)
  const cycleProjectSelection = useWorkspaceStore((s) => s.cycleProjectSelection)
  const hydrateTerminalTypography = useWorkspaceStore((s) => s.hydrateTerminalTypography)
  const hydrateThemePreference = useWorkspaceStore((s) => s.hydrateThemePreference)
  const openProjectDialog = useWorkspaceStore((s) => s.openProjectDialog)
  const refreshActiveProject = useWorkspaceStore((s) => s.refreshActiveProject)
  const removeProject = useWorkspaceStore((s) => s.removeProject)
  const reorderProjects = useWorkspaceStore((s) => s.reorderProjects)
  const selectFile = useWorkspaceStore((s) => s.selectFile)
  const selectProject = useWorkspaceStore((s) => s.selectProject)
  const selectTheme = useWorkspaceStore((s) => s.selectTheme)
  const setTerminalTypography = useWorkspaceStore((s) => s.setTerminalTypography)
  const updateAgentStatus = useWorkspaceStore((s) => s.updateAgentStatus)
  const updateTerminalState = useWorkspaceStore((s) => s.updateTerminalState)

  // Theme resolution
  const resolvedThemeId = previewThemeId ?? activeThemeId
  const activeTheme = useMemo(() => getThemeById(resolvedThemeId), [resolvedThemeId])

  // Derived values
  const recentProjects = useMemo(
    () => orderProjectsByRecency(projects, recentProjectIds),
    [projects, recentProjectIds],
  )
  const commandPaletteProjects = useMemo(
    () =>
      projects.map((project) => ({
        active: project.id === activeProjectId,
        id: project.id,
        label: project.name,
      })),
    [projects, activeProjectId],
  )

  // Callbacks
  const handleSelectFile = useCallback(
    (path: string) => { void selectFile(path) },
    [selectFile],
  )
  const handleSelectProject = useCallback(
    (projectId: string) => { void selectProject(projectId) },
    [selectProject],
  )
  const handleSplitTerminal = useCallback(() => {
    if (activeProjectId) { void addTerminalPane(activeProjectId) }
  }, [activeProjectId, addTerminalPane])
  const handleCloseCommandPalette = useCallback(
    () => setIsCommandPaletteOpen(false),
    [],
  )
  const handleRemoveProject = useCallback(
    (projectId: string) => void removeProject(projectId),
    [removeProject],
  )
  const previewTheme = useCallback((themeId: string) => {
    const nextTheme = getThemeById(themeId)

    setPreviewThemeId((currentThemeId) => currentThemeId === nextTheme.id ? currentThemeId : nextTheme.id)
  }, [])
  const resetThemePreview = useCallback((themeId?: string) => {
    setPreviewThemeId(null)

    if (themeId) {
      applyThemeToDocument(getThemeById(themeId))
    }
  }, [])
  const commitThemeSelection = useCallback((themeId: string) => {
    selectTheme(themeId)
    setPreviewThemeId(null)
  }, [selectTheme])

  // Boot & hydration effects
  useEffect(() => {
    hydrateThemePreference()
    hydrateTerminalTypography()
    hydrateKnowledge()
  }, [hydrateKnowledge, hydrateTerminalTypography, hydrateThemePreference])

  useEffect(() => {
    applyThemeToDocument(activeTheme)
  }, [activeTheme])

  useEffect(() => {
    void maybeStartPerformanceProbe()
  }, [])

  useEffect(() => {
    const scheduled = scheduleIdleTask(() => {
      void import('./components/workspace-diff-panel')
      void import('./components/workspace-terminal')
    })

    return () => {
      scheduled.cancel()
    }
  }, [])

  // Global keyboard shortcuts
  useEffect(() => {
    function handleGlobalCommandShortcut(event: KeyboardEvent): void {
      const usesCommandPaletteShortcut =
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === 'p'

      if (!usesCommandPaletteShortcut) {
        return
      }

      event.preventDefault()
      setIsCommandPaletteOpen(true)
    }

    function handleProjectSwitchShortcut(event: KeyboardEvent): void {
      if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        void cycleProjectSelection('previous')
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        void cycleProjectSelection('next')
      }
    }

    window.addEventListener('keydown', handleGlobalCommandShortcut)
    window.addEventListener('keydown', handleProjectSwitchShortcut)

    return () => {
      window.removeEventListener('keydown', handleGlobalCommandShortcut)
      window.removeEventListener('keydown', handleProjectSwitchShortcut)
    }
  }, [cycleProjectSelection])

  // Tauri event bindings + bootstrap
  useEffect(() => {
    let disposed = false
    let unlistenAgentStatus: (() => void) | undefined
    let unlistenProjectRefresh: (() => void) | undefined
    let unlistenTerminalOutput: (() => void) | undefined
    let unlistenTerminalState: (() => void) | undefined

    async function bindEvents(): Promise<void> {
      const agentStatusBinding = listenAgentStatus((event) => {
        if (!disposed) {
          updateAgentStatus(event)
        }
      })
      const projectRefreshBinding = listenProjectRefresh((event) => {
        if (!disposed) {
          void refreshActiveProject(event.projectId, { changedPaths: event.paths })
        }
      })
      const terminalOutputBinding = listenTerminalOutput((event) => {
        if (!disposed) {
          publishTerminalOutput(event)
        }
      })
      const terminalStateBinding = listenTerminalState((event) => {
        if (!disposed) {
          updateTerminalState(event)
        }
      })

      ;[
        unlistenAgentStatus,
        unlistenProjectRefresh,
        unlistenTerminalOutput,
        unlistenTerminalState,
      ] = await Promise.all([
        agentStatusBinding,
        projectRefreshBinding,
        terminalOutputBinding,
        terminalStateBinding,
      ])
    }

    async function bootstrapAfterBindings(): Promise<void> {
      if (isTauriEnvironment()) {
        await bindEvents()
      }

      if (!disposed) {
        await bootstrap()
      }
    }

    void bootstrapAfterBindings()

    return () => {
      disposed = true
      unlistenAgentStatus?.()
      unlistenProjectRefresh?.()
      unlistenTerminalOutput?.()
      unlistenTerminalState?.()
    }
  }, [bootstrap, refreshActiveProject, updateAgentStatus, updateTerminalState])

  // --- Render ---

  const commandPalette = (
    <CommandPalette
      activeProjectId={activeProjectId}
      activeThemeId={activeThemeId}
      currentThemeId={resolvedThemeId}
      files={snapshot?.files ?? []}
      isOpen={isCommandPaletteOpen}
      onClose={handleCloseCommandPalette}
      onOpenProject={openProjectDialog}
      onPreviewTheme={previewTheme}
      onResetThemePreview={resetThemePreview}
      onSelectFile={handleSelectFile}
      onSelectProject={handleSelectProject}
      onSelectTheme={commitThemeSelection}
      onSplitTerminal={handleSplitTerminal}
      projects={commandPaletteProjects}
    />
  )

  if (isBooting) {
    return (
      <>
        <div className="flex h-screen items-center justify-center bg-[var(--bg-base)] text-[var(--text-secondary)]">
          正在准备 Flowterm 工作台...
        </div>
        {commandPalette}
      </>
    )
  }

  return (
    <>
      <div className="flex h-screen flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
        <WorkspaceTabBar
          activeProjectId={activeProjectId}
          onAddProject={openProjectDialog}
          onRemoveProject={handleRemoveProject}
          onReorderProjects={reorderProjects}
          onSelectProject={handleSelectProject}
          projects={projects}
          recentProjects={recentProjects}
        />
        {snapshot ? (
          workspaceSidebarView === 'settings' ? (
            <PanelGroup
              autoSaveId="flowterm-settings-layout"
              className="flex-1"
              direction="horizontal"
            >
              <Panel defaultSize={15} minSize={12}>
                <WorkspaceSidebar
                  cardCount={projectCardCount}
                  files={snapshot.files}
                  onSelectView={setWorkspaceSidebarView}
                  selectedView={workspaceSidebarView}
                >
                  <WorkspaceTreePane
                    activeProjectId={activeProjectId}
                    files={snapshot.files}
                  />
                </WorkspaceSidebar>
              </Panel>
              <ResizeHandle />
              <Panel defaultSize={85} minSize={40}>
                <WorkspaceSettings
                  activeProjectId={activeProjectId}
                  activeThemeId={activeTheme.id}
                  files={snapshot.files}
                  onOpenProject={openProjectDialog}
                  onSelectSection={setWorkspaceSettingsSection}
                  onSelectTheme={selectTheme}
                  onUpdateTerminalTypography={setTerminalTypography}
                  projects={projects}
                  selectedSection={workspaceSettingsSection}
                  terminalTypography={terminalTypography}
                />
              </Panel>
            </PanelGroup>
          ) : workspaceSidebarView === 'board' ? (
            <PanelGroup
              autoSaveId="flowterm-board-layout"
              className="flex-1"
              direction="horizontal"
            >
              <Panel defaultSize={15} minSize={12}>
                <WorkspaceSidebar
                  cardCount={projectCardCount}
                  files={snapshot.files}
                  onSelectView={setWorkspaceSidebarView}
                  selectedView={workspaceSidebarView}
                >
                  <WorkspaceTreePane
                    activeProjectId={activeProjectId}
                    files={snapshot.files}
                  />
                </WorkspaceSidebar>
              </Panel>
              <ResizeHandle />
              <Panel defaultSize={85} minSize={40}>
                <Suspense fallback={<PanelFallback message="正在加载知识看板..." />}>
                  <KnowledgeBoard projectId={activeProjectId} />
                </Suspense>
              </Panel>
            </PanelGroup>
          ) : (
            <PanelGroup autoSaveId="flowterm-layout" className="flex-1" direction="horizontal">
              <Panel defaultSize={15} minSize={12}>
                <WorkspaceSidebar
                  cardCount={projectCardCount}
                  files={snapshot.files}
                  onSelectView={setWorkspaceSidebarView}
                  selectedView={workspaceSidebarView}
                >
                  <WorkspaceTreePane
                    activeProjectId={activeProjectId}
                    files={snapshot.files}
                  />
                </WorkspaceSidebar>
              </Panel>
              <ResizeHandle />
              <Panel defaultSize={55} minSize={28}>
                <DiffPanelSlot syntaxThemeId={activeTheme.id} />
              </Panel>
              <ResizeHandle />
              <Panel defaultSize={30} minSize={20}>
                {activeProjectId ? (
                  <TerminalPanelSlot
                    activeProjectId={activeProjectId}
                    theme={activeTheme.terminal}
                  />
                ) : null}
              </Panel>
            </PanelGroup>
          )
        ) : activeProjectId ? (
          <div className="flex flex-1 items-center justify-center bg-[var(--bg-base)]">
            <div className="flex flex-col items-center gap-3 text-[var(--text-muted)]">
              <div className="h-4 w-4 animate-pulse rounded-full bg-[var(--text-muted)] opacity-20" />
              <span className="text-xs tracking-wide opacity-40">正在加载工作区...</span>
            </div>
          </div>
        ) : (
          <EmptyState onAddProject={openProjectDialog} />
        )}
        {error ? (
          <div className="flex items-center gap-2 border-t border-[var(--border-subtle)] bg-[var(--error-banner-bg)] px-4 py-2 text-sm text-[var(--accent-clay)]">
            <AlertTriangle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        ) : null}
      </div>
      {commandPalette}
    </>
  )
}

// ---------------------------------------------------------------------------
// Isolated panel slots — each owns its store subscriptions so changes in one
// panel never force the other panels (or App) to re-render.
// ---------------------------------------------------------------------------

function DiffPanelSlot({
  syntaxThemeId,
}: {
  syntaxThemeId: string
}): ReactElement {
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId)
  const selectedFilePath = useWorkspaceStore((s) => s.selectedFilePath)
  const filePreview = useWorkspaceStore((s) => s.filePreview)
  const isFilePreviewLoading = useWorkspaceStore((s) => s.isFilePreviewLoading)
  const fetchFilePreview = useWorkspaceStore((s) => s.fetchFilePreview)
  const refreshActiveProject = useWorkspaceStore((s) => s.refreshActiveProject)

  const requestPreviewWindow = useCallback(
    (startLine: number, lineCount: number) => {
      void fetchFilePreview(activeProjectId, selectedFilePath, { lineCount, startLine })
    },
    [activeProjectId, fetchFilePreview, selectedFilePath],
  )
  const handleSaveMarkdown = useCallback(
    async (path: string, content: string) => {
      if (!activeProjectId || !isTauriEnvironment()) {
        return
      }

      await writeProjectFile(activeProjectId, path, content)
      await refreshActiveProject(activeProjectId, { changedPaths: [path] })
    },
    [activeProjectId, refreshActiveProject],
  )

  return (
    <Suspense fallback={<PanelFallback message="正在准备工作区预览..." />}>
      <WorkspaceDiffPanel
        isLoading={isFilePreviewLoading}
        onRequestWindow={requestPreviewWindow}
        onSaveMarkdown={handleSaveMarkdown}
        preview={filePreview}
        selectedFilePath={selectedFilePath}
        syntaxThemeId={syntaxThemeId}
      />
    </Suspense>
  )
}

function TerminalPanelSlot({
  activeProjectId,
  theme,
}: {
  activeProjectId: string
  theme: { background: string; cursor: string; foreground: string }
}): ReactElement {
  const terminalProjectStateRaw = useWorkspaceStore(
    (s) => s.terminalProjectStateByProject[activeProjectId] ?? null,
  )
  const terminalProjectState =
    terminalProjectStateRaw ?? EMPTY_TERMINAL_PROJECT_STATE
  const typography = useWorkspaceStore((s) => s.terminalTypography)
  const addTerminalPane = useWorkspaceStore((s) => s.addTerminalPane)
  const removeTerminalPane = useWorkspaceStore((s) => s.removeTerminalPane)
  const resizeTerminal = useWorkspaceStore((s) => s.resizeTerminal)
  const selectTerminalPane = useWorkspaceStore((s) => s.selectTerminalPane)
  const toggleSplitView = useWorkspaceStore((s) => s.toggleSplitView)
  const updateTerminalPaneSizes = useWorkspaceStore((s) => s.updateTerminalPaneSizes)
  const writeTerminal = useWorkspaceStore((s) => s.writeTerminal)
  const terminalPaneSizes = useWorkspaceStore(
    (s) =>
      s.workspaceStateByProject[activeProjectId]?.terminalPaneSizes ?? EMPTY_PANE_SIZES,
  )
  const activeTerminalPaneId = useWorkspaceStore(
    (s) =>
      s.workspaceStateByProject[activeProjectId]?.activePaneId ?? null,
  )
  const isTerminalSplitView = useWorkspaceStore(
    (s) =>
      s.workspaceStateByProject[activeProjectId]?.isSplitView ?? true,
  )

  const terminalPanes = useMemo(
    () => buildTerminalPaneDescriptors(terminalProjectState),
    [terminalProjectState],
  )

  const handleAddPane = useCallback(
    () => { void addTerminalPane(activeProjectId) },
    [activeProjectId, addTerminalPane],
  )
  const handleTerminalLayout = useCallback(
    (sizes: number[]) => { updateTerminalPaneSizes(activeProjectId, sizes) },
    [activeProjectId, updateTerminalPaneSizes],
  )
  const handleRemovePane = useCallback(
    (paneId: string) => { void removeTerminalPane(activeProjectId, paneId) },
    [activeProjectId, removeTerminalPane],
  )
  const handleSelectPane = useCallback(
    (paneId: string) => { selectTerminalPane(activeProjectId, paneId) },
    [activeProjectId, selectTerminalPane],
  )
  const handleToggleSplitView = useCallback(
    () => { toggleSplitView(activeProjectId) },
    [activeProjectId, toggleSplitView],
  )

  return (
    <Suspense fallback={<PanelFallback message="正在连接终端..." />}>
      <WorkspaceTerminal
        activePaneId={activeTerminalPaneId}
        isSplitView={isTerminalSplitView}
        onAddPane={handleAddPane}
        onLayout={handleTerminalLayout}
        onRemovePane={handleRemovePane}
        onSelectPane={handleSelectPane}
        onToggleSplitView={handleToggleSplitView}
        paneSizes={terminalPaneSizes}
        panes={terminalPanes}
        resizeTerminal={resizeTerminal}
        theme={theme}
        typography={typography}
        writeTerminal={writeTerminal}
      />
    </Suspense>
  )
}

// ---------------------------------------------------------------------------
// WorkspaceTreePane — subscribes to its own slices of workspace state
// ---------------------------------------------------------------------------

function WorkspaceTreePane({
  activeProjectId,
  files,
}: {
  activeProjectId: string | null
  files: ProjectFileEntry[]
}): ReactElement {
  const selectedFilePath = useWorkspaceStore((s) => s.selectedFilePath)
  const expandedPaths = useWorkspaceStore(
    (s) =>
      (activeProjectId ? s.workspaceStateByProject[activeProjectId]?.treeExpandedPaths : null) ??
      EMPTY_EXPANDED_PATHS,
  )
  const createProjectEntry = useWorkspaceStore((s) => s.createProjectEntry)
  const selectFile = useWorkspaceStore((s) => s.selectFile)
  const setTreePathExpanded = useWorkspaceStore((s) => s.setTreePathExpanded)
  const handleCreateEntry = useCallback(
    async (path: string, kind: 'file' | 'folder') => {
      if (!activeProjectId) {
        return
      }

      await createProjectEntry(activeProjectId, path, kind)
    },
    [activeProjectId, createProjectEntry],
  )
  const handleSelectFile = useCallback(
    (path: string) => {
      void selectFile(path)
    },
    [selectFile],
  )
  const handleToggleFolder = useCallback(
    (path: string, expanded: boolean) => {
      if (activeProjectId) {
        setTreePathExpanded(activeProjectId, path, expanded)
      }
    },
    [activeProjectId, setTreePathExpanded],
  )

  return (
    <WorkspaceFileTree
      expandedPaths={expandedPaths}
      files={files}
      onCreateEntry={handleCreateEntry}
      onSelectFile={handleSelectFile}
      onToggleFolder={handleToggleFolder}
      selectedFilePath={selectedFilePath}
    />
  )
}

// ---------------------------------------------------------------------------
// Static layout components
// ---------------------------------------------------------------------------

function ResizeHandle(): ReactElement {
  return (
    <PanelResizeHandle className="w-1 shrink-0 bg-[var(--bg-base)] transition-colors duration-150 hover:bg-[var(--interactive-hover)] data-[resize-handle-active]:bg-[var(--accent-amber)]" />
  )
}

function PanelFallback({
  message,
}: {
  message: string
}): ReactElement {
  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-[var(--bg-base)] px-6 text-center text-[var(--text-muted)] text-sm">
      {message}
    </div>
  )
}

function EmptyState({
  onAddProject,
}: {
  onAddProject: () => void
}): ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-[var(--bg-base)] text-center">
      <div className="space-y-3">
        <p className="text-lg font-medium tracking-[-0.02em] text-[var(--text-primary)]">
          Flowterm
        </p>
        <p className="max-w-xs text-[13px] leading-relaxed text-[var(--text-muted)]">
          在一个窗口里运行 Agent，并同时看到文件树、Diff 和终端输出。
        </p>
      </div>
      <button
        className="rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] px-5 py-2 text-[13px] text-[var(--text-secondary)] transition-all hover:border-[var(--accent-amber)] hover:text-[var(--text-primary)]"
        onClick={onAddProject}
        type="button"
      >
        打开项目
      </button>
    </div>
  )
}

export default App

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.isContentEditable) {
    return true
  }

  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)
}
