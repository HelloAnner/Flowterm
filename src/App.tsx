import {
  lazy,
  Suspense,
  type ReactElement,
  useEffect,
  useState,
} from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from 'react-resizable-panels'

import { AddProjectDialog } from './components/add-project-dialog'
import { WorkspaceFileTree } from './components/workspace-file-tree'
import {
  WorkspaceSidebar,
  type WorkspaceSidebarView,
} from './components/workspace-sidebar'
import { WorkspaceTabBar } from './components/workspace-tab-bar'
import {
  buildTerminalPaneDescriptors,
  createTerminalProjectState,
} from './features/workspace/terminal-panes'
import { publishTerminalOutput } from './features/workspace/terminal-stream'
import { maybeStartPerformanceProbe } from './e2e/performance-probe'
import {
  isTauriEnvironment,
  listenProjectRefresh,
  listenTerminalOutput,
  listenTerminalState,
} from './lib/tauri'
import { useWorkspaceStore } from './stores/workspace-store'

const EMPTY_TERMINAL_PROJECT_STATE = createTerminalProjectState()
const WorkspaceDiffPanel = lazy(async () => ({
  default: (await import('./components/workspace-diff-panel')).WorkspaceDiffPanel,
}))
const WorkspaceTerminal = lazy(async () => ({
  default: (await import('./components/workspace-terminal')).WorkspaceTerminal,
}))

function App(): ReactElement {
  const [workspaceSidebarView, setWorkspaceSidebarView] =
    useState<WorkspaceSidebarView>('tree')
  const activeProjectId = useWorkspaceStore((state) => state.activeProjectId)
  const bootstrap = useWorkspaceStore((state) => state.bootstrap)
  const error = useWorkspaceStore((state) => state.error)
  const filePreview = useWorkspaceStore((state) => state.filePreview)
  const isBooting = useWorkspaceStore((state) => state.isBooting)
  const isFilePreviewLoading = useWorkspaceStore((state) => state.isFilePreviewLoading)
  const openProjectDialog = useWorkspaceStore((state) => state.openProjectDialog)
  const projects = useWorkspaceStore((state) => state.projects)
  const fetchFilePreview = useWorkspaceStore((state) => state.fetchFilePreview)
  const refreshActiveProject = useWorkspaceStore((state) => state.refreshActiveProject)
  const removeProject = useWorkspaceStore((state) => state.removeProject)
  const selectFile = useWorkspaceStore((state) => state.selectFile)
  const selectedFilePath = useWorkspaceStore((state) => state.selectedFilePath)
  const selectProject = useWorkspaceStore((state) => state.selectProject)
  const setTreeExpandedPaths = useWorkspaceStore((state) => state.setTreeExpandedPaths)
  const snapshot = useWorkspaceStore((state) => state.snapshot)
  const addTerminalPane = useWorkspaceStore((state) => state.addTerminalPane)
  const removeTerminalPane = useWorkspaceStore((state) => state.removeTerminalPane)
  const resizeTerminal = useWorkspaceStore((state) => state.resizeTerminal)
  const updateTerminalPaneSizes = useWorkspaceStore((state) => state.updateTerminalPaneSizes)
  const terminalProjectStateForActiveProject = useWorkspaceStore(
    (state) =>
      (activeProjectId ? state.terminalProjectStateByProject[activeProjectId] : null) ?? null,
  )
  const terminalProjectState =
    terminalProjectStateForActiveProject ?? EMPTY_TERMINAL_PROJECT_STATE
  const workspaceStateForActiveProject = useWorkspaceStore(
    (state) => (activeProjectId ? state.workspaceStateByProject[activeProjectId] : null) ?? null,
  )
  const updateTerminalState = useWorkspaceStore((state) => state.updateTerminalState)
  const writeTerminal = useWorkspaceStore((state) => state.writeTerminal)
  const treeExpandedPaths = workspaceStateForActiveProject?.treeExpandedPaths ?? {}
  const terminalPaneSizes = workspaceStateForActiveProject?.terminalPaneSizes ?? []
  const requestPreviewWindow = (startLine: number, lineCount: number) => {
    void fetchFilePreview(activeProjectId, selectedFilePath, { lineCount, startLine })
  }

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    void maybeStartPerformanceProbe()
  }, [])

  useEffect(() => {
    if (!isTauriEnvironment()) {
      return
    }

    let disposed = false
    let unlistenProjectRefresh: (() => void) | undefined
    let unlistenTerminalOutput: (() => void) | undefined
    let unlistenTerminalState: (() => void) | undefined

    async function bindEvents(): Promise<void> {
      unlistenProjectRefresh = await listenProjectRefresh((event) => {
        if (!disposed) {
          void refreshActiveProject(event.projectId)
        }
      })
      unlistenTerminalOutput = await listenTerminalOutput((event) => {
        if (!disposed) {
          publishTerminalOutput(event)
        }
      })
      unlistenTerminalState = await listenTerminalState((event) => {
        if (!disposed) {
          updateTerminalState(event)
        }
      })
    }

    void bindEvents()

    return () => {
      disposed = true
      unlistenProjectRefresh?.()
      unlistenTerminalOutput?.()
      unlistenTerminalState?.()
    }
  }, [refreshActiveProject, updateTerminalState])

  if (isBooting) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg-base)] text-[var(--text-secondary)]">
        正在准备 Flowterm 工作台...
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <WorkspaceTabBar
        activeProjectId={activeProjectId}
        onAddProject={openProjectDialog}
        onRemoveProject={(projectId) => void removeProject(projectId)}
        onSelectProject={(projectId) => void selectProject(projectId)}
        projects={projects}
      />
      {snapshot ? (
        <PanelGroup autoSaveId="flowterm-layout" className="flex-1" direction="horizontal">
          <Panel defaultSize={15} minSize={12}>
            <WorkspaceSidebar
              files={snapshot.files}
              onSelectView={setWorkspaceSidebarView}
              selectedView={workspaceSidebarView}
            >
              {workspaceSidebarView === 'tree' ? (
                <WorkspaceFileTree
                  expandedPaths={treeExpandedPaths}
                  files={snapshot.files}
                  onExpandedPathsChange={(expandedPaths) => {
                    if (activeProjectId) {
                      setTreeExpandedPaths(activeProjectId, expandedPaths)
                    }
                  }}
                  onSelectFile={selectFile}
                  selectedFilePath={selectedFilePath}
                />
              ) : null}
            </WorkspaceSidebar>
          </Panel>
          <ResizeHandle />
          <Panel defaultSize={55} minSize={28}>
            <Suspense fallback={<PanelFallback message="正在准备工作区预览..." />}>
              <WorkspaceDiffPanel
                isLoading={isFilePreviewLoading}
                onRequestWindow={requestPreviewWindow}
                preview={filePreview}
                selectedFilePath={selectedFilePath}
              />
            </Suspense>
          </Panel>
          <ResizeHandle />
          <Panel defaultSize={30} minSize={20}>
            <Suspense fallback={<PanelFallback message="正在连接终端..." />}>
              <WorkspaceTerminal
                onAddPane={() => activeProjectId && void addTerminalPane(activeProjectId)}
                onLayout={(sizes) => {
                  if (activeProjectId) {
                    updateTerminalPaneSizes(activeProjectId, sizes)
                  }
                }}
                onRemovePane={(paneId) =>
                  activeProjectId && void removeTerminalPane(activeProjectId, paneId)
                }
                paneSizes={terminalPaneSizes}
                panes={buildTerminalPaneDescriptors(terminalProjectState)}
                resizeTerminal={resizeTerminal}
                writeTerminal={writeTerminal}
              />
            </Suspense>
          </Panel>
        </PanelGroup>
      ) : (
        <EmptyState onAddProject={openProjectDialog} />
      )}
      {error ? (
        <div className="flex items-center gap-2 border-t border-[var(--border-subtle)] bg-[rgba(160,96,80,0.12)] px-4 py-2 text-sm text-[var(--accent-clay)]">
          <AlertTriangle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      ) : null}
      <AddProjectDialog />
    </div>
  )
}

function ResizeHandle(): ReactElement {
  return (
    <PanelResizeHandle className="group relative w-px bg-[var(--border-subtle)] transition-colors data-[resize-handle-active]:bg-[var(--accent-amber)]">
      <span className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-[rgba(200,169,110,0.12)]" />
    </PanelResizeHandle>
  )
}

function PanelFallback({
  message,
}: {
  message: string
}): ReactElement {
  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-[var(--bg-base)] px-6 text-center font-mono text-[12px] tracking-wide text-[var(--text-muted)]">
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
        <p className="font-mono text-3xl font-bold tracking-[-0.02em] text-[var(--border-subtle)]">
          &gt; flowterm
        </p>
        <p className="text-sm text-[var(--text-secondary)]">
          在一个窗口里运行 Agent，并同时看到文件树、Diff 和终端输出。
        </p>
      </div>
      <button
        className="rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] px-6 py-3 font-mono text-sm text-[var(--accent-amber)] transition-colors hover:border-[var(--accent-amber)] hover:bg-[var(--bg-overlay)]"
        onClick={onAddProject}
        type="button"
      >
        $ open project
      </button>
    </div>
  )
}

export default App
