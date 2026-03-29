import { type ReactElement, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from 'react-resizable-panels'

import { AddProjectDialog } from './components/add-project-dialog'
import { WorkspaceDiffPanel } from './components/workspace-diff-panel'
import { WorkspaceFileTree } from './components/workspace-file-tree'
import { WorkspaceTabBar } from './components/workspace-tab-bar'
import { WorkspaceTerminal } from './components/workspace-terminal'
import {
  isTauriEnvironment,
  listenProjectRefresh,
  listenTerminalOutput,
  listenTerminalState,
} from './lib/tauri'
import { useWorkspaceStore } from './stores/workspace-store'

function App(): ReactElement {
  const activeProjectId = useWorkspaceStore((state) => state.activeProjectId)
  const bootstrap = useWorkspaceStore((state) => state.bootstrap)
  const diffMode = useWorkspaceStore((state) => state.diffMode)
  const error = useWorkspaceStore((state) => state.error)
  const isBooting = useWorkspaceStore((state) => state.isBooting)
  const lastTerminalEvent = useWorkspaceStore((state) => state.lastTerminalEvent)
  const openProjectDialog = useWorkspaceStore((state) => state.openProjectDialog)
  const projects = useWorkspaceStore((state) => state.projects)
  const refreshActiveProject = useWorkspaceStore((state) => state.refreshActiveProject)
  const removeProject = useWorkspaceStore((state) => state.removeProject)
  const selectFile = useWorkspaceStore((state) => state.selectFile)
  const selectedFilePath = useWorkspaceStore((state) => state.selectedFilePath)
  const selectProject = useWorkspaceStore((state) => state.selectProject)
  const setDiffMode = useWorkspaceStore((state) => state.setDiffMode)
  const snapshot = useWorkspaceStore((state) => state.snapshot)
  const appendTerminalChunk = useWorkspaceStore((state) => state.appendTerminalChunk)
  const resizeTerminal = useWorkspaceStore((state) => state.resizeTerminal)
  const terminalHistory = useWorkspaceStore(
    (state) => (activeProjectId ? state.terminalHistoryByProject[activeProjectId] : '') ?? '',
  )
  const terminalShellLabel = useWorkspaceStore(
    (state) =>
      (activeProjectId ? state.terminalShellLabelByProject[activeProjectId] : '') ??
      'shell',
  )
  const terminalState = useWorkspaceStore(
    (state) => (activeProjectId ? state.terminalStateByProject[activeProjectId] : 'idle') ?? 'idle',
  )
  const updateTerminalState = useWorkspaceStore((state) => state.updateTerminalState)
  const writeTerminal = useWorkspaceStore((state) => state.writeTerminal)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

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
          appendTerminalChunk(event)
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
  }, [appendTerminalChunk, refreshActiveProject, updateTerminalState])

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
            <WorkspaceFileTree
              files={snapshot.files}
              onSelectFile={selectFile}
              selectedFilePath={selectedFilePath}
            />
          </Panel>
          <ResizeHandle />
          <Panel defaultSize={55} minSize={28}>
            <WorkspaceDiffPanel
              diffMode={diffMode}
              diffs={diffMode === 'live' ? snapshot.liveDiffs : snapshot.gitDiffs}
              onDiffModeChange={setDiffMode}
              selectedFilePath={selectedFilePath}
            />
          </Panel>
          <ResizeHandle />
          <Panel defaultSize={30} minSize={20}>
            <WorkspaceTerminal
              history={terminalHistory}
              lastChunk={
                lastTerminalEvent?.projectId === activeProjectId
                  ? lastTerminalEvent.chunk
                  : null
              }
              projectId={activeProjectId}
              resizeTerminal={resizeTerminal}
              shellLabel={terminalShellLabel}
              state={terminalState}
              writeTerminal={writeTerminal}
            />
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
