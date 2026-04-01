import '@xterm/xterm/css/xterm.css'

import {
  memo,
  type ReactElement,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
} from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Plus, X } from 'lucide-react'

import type { TerminalTypography } from '../features/workspace/terminal-preferences'
import {
  acquireTerminal,
  releaseTerminal,
  updatePoolTheme,
  updatePoolTypography,
} from '../features/workspace/terminal-pool'
import { cn } from '../lib/utils'
import type { AgentStatusSnapshot, TerminalState } from '../lib/contracts'
import { TerminalSessionRail, type TerminalSession } from './terminal-session-rail'

export interface TerminalPaneDescriptor {
  agentStatus: AgentStatusSnapshot
  cwd: string | null
  id: string
  history: string
  projectId: string
  sessionId: string
  shellLabel: string
  state: TerminalState
}

interface WorkspaceTerminalProps {
  activePaneId: string | null
  isSplitView: boolean
  onAddPane: () => void
  onLayout: (sizes: number[]) => void
  onRemovePane: (paneId: string) => void
  onSelectPane: (paneId: string) => void
  onToggleSplitView: () => void
  paneSizes: number[]
  panes: TerminalPaneDescriptor[]
  resizeTerminal: (sessionId: string, cols: number, rows: number) => Promise<void>
  theme: {
    background: string
    cursor: string
    foreground: string
  }
  typography: TerminalTypography
  writeTerminal: (sessionId: string, data: string) => Promise<void>
}

export const WorkspaceTerminal = memo(function WorkspaceTerminal({
  activePaneId,
  isSplitView,
  onAddPane,
  onLayout,
  onRemovePane,
  onSelectPane,
  onToggleSplitView,
  paneSizes,
  panes,
  resizeTerminal,
  theme,
  typography,
  writeTerminal,
}: WorkspaceTerminalProps): ReactElement {
  const canAddPane = panes.length < 3
  const hasMultiplePanes = panes.length > 1
  const showAllPanes = isSplitView || !hasMultiplePanes || !activePaneId
  const visiblePanes = showAllPanes ? panes : panes.filter((pane) => pane.id === activePaneId)
  const visiblePaneSizes = showAllPanes ? paneSizes : [100]

  const sessions = useMemo<TerminalSession[]>(
    () =>
      panes.map((pane, index) => ({
        id: pane.id,
        name: resolveSessionName(pane, index),
        shellLabel: pane.shellLabel,
        state: pane.state,
      })),
    [panes],
  )

  useEffect(() => {
    if (panes.length > 0 && !activePaneId) {
      onSelectPane(panes[0].id)
    } else if (activePaneId && !panes.find((p) => p.id === activePaneId) && panes.length > 0) {
      onSelectPane(panes[0].id)
    }
  }, [panes, activePaneId, onSelectPane])

  return (
    <div className="terminal-surface flex h-full min-h-0 flex-col m-2.5">
      {/* Terminal panes — no outer toolbar chrome */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {visiblePanes.length > 1 ? (
          <PanelGroup
            className="h-full w-full"
            direction="vertical"
            key={`${visiblePanes[0]?.projectId ?? 'terminal'}-${visiblePanes.map((pane) => pane.id).join(':')}`}
            onLayout={onLayout}
          >
            {visiblePanes.flatMap((pane, index) =>
              [
                index > 0 ? (
                  <PanelResizeHandle
                    className="group h-[3px] shrink-0 cursor-row-resize bg-[var(--terminal-divider-strong)] transition-colors hover:bg-[var(--border-subtle)] data-[resize-handle-active]:bg-[var(--accent-amber)]"
                    key={`handle-${pane.id}`}
                  />
                ) : null,
                <Panel
                  className="overflow-hidden"
                  defaultSize={visiblePaneSizes[index] ?? 100 / visiblePanes.length}
                  key={pane.id}
                  minSize={15}
                >
                  <TerminalPane
                    onAddPane={null}
                    onRemove={visiblePanes.length > 1 ? () => onRemovePane(pane.id) : null}
                    pane={pane}
                    resizeTerminal={resizeTerminal}
                    theme={theme}
                    typography={typography}
                    writeTerminal={writeTerminal}
                  />
                </Panel>,
              ].filter(Boolean),
            )}
          </PanelGroup>
        ) : visiblePanes.length === 1 ? (
          <TerminalPane
            onAddPane={canAddPane ? onAddPane : null}
            onRemove={panes.length > 1 ? () => onRemovePane(visiblePanes[0].id) : null}
            pane={visiblePanes[0]}
            resizeTerminal={resizeTerminal}
            theme={theme}
            typography={typography}
            writeTerminal={writeTerminal}
          />
        ) : null}
      </div>

      {/* Bottom session strip — appears only when multiple panes exist */}
      {hasMultiplePanes && (
        <TerminalSessionRail
          activeSessionId={activePaneId ?? panes[0]?.id}
          canAdd={canAddPane}
          isSplitView={isSplitView}
          onAddSession={onAddPane}
          onRemoveSession={onRemovePane}
          onSelectSession={onSelectPane}
          onToggleSplitView={onToggleSplitView}
          sessions={sessions}
        />
      )}
    </div>
  )
})

interface TerminalPaneProps {
  onAddPane: (() => void) | null
  onRemove: (() => void) | null
  pane: TerminalPaneDescriptor
  resizeTerminal: (sessionId: string, cols: number, rows: number) => Promise<void>
  theme: {
    background: string
    cursor: string
    foreground: string
  }
  typography: TerminalTypography
  writeTerminal: (sessionId: string, data: string) => Promise<void>
}

const TerminalPane = memo(function TerminalPane({
  onAddPane,
  onRemove,
  pane,
  resizeTerminal,
  theme,
  typography,
  writeTerminal,
}: TerminalPaneProps): ReactElement {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const pooledRef = useRef<ReturnType<typeof acquireTerminal> | null>(null)
  const handleResizeTerminal = useEffectEvent(
    (sessionId: string, cols: number, rows: number) => resizeTerminal(sessionId, cols, rows),
  )
  const handleWriteTerminal = useEffectEvent(
    (sessionId: string, data: string) => writeTerminal(sessionId, data),
  )

  // Acquire pooled terminal and mount its container into our viewport
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const pooled = acquireTerminal(
      pane.sessionId,
      pane.history,
      theme,
      typography,
      handleResizeTerminal,
      handleWriteTerminal,
    )
    pooledRef.current = pooled

    // Mount the pool-owned container into our DOM slot
    viewport.appendChild(pooled.container)

    // ResizeObserver for auto-fitting when the viewport size changes
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        pooled.fitAddon.fit()
        const dimensions = pooled.fitAddon.proposeDimensions()
        if (dimensions) {
          pooled.resizeScheduler({ cols: dimensions.cols, rows: dimensions.rows })
        }
      })
    })
    observer.observe(viewport)

    // Initial fit + focus
    requestAnimationFrame(() => {
      pooled.fitAddon.fit()
      pooled.terminal.focus()
    })

    return () => {
      observer.disconnect()
      releaseTerminal(pane.sessionId)
      pooledRef.current = null
    }
  }, [pane.sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live theme update across pool
  useEffect(() => {
    updatePoolTheme(theme)
  }, [theme])

  // Live typography update across pool
  useEffect(() => {
    updatePoolTypography(typography)
  }, [typography])

  const handleViewportClick = useCallback(() => {
    pooledRef.current?.terminal.focus()
  }, [])

  return (
    <div className="terminal-pane-shell flex h-full min-h-0 flex-col overflow-hidden">
      {/* Ambient header */}
      <div className="terminal-pane-header flex h-8 shrink-0 items-center justify-between px-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={cn(
              'h-1.5 w-1.5 shrink-0 rounded-full transition-all duration-300',
              pane.state === 'attention' && 'bg-[var(--accent-amber)]',
              pane.state === 'running' && 'animate-pulse bg-[var(--accent-sage)]',
              pane.state === 'exited' && 'bg-[var(--accent-clay)]',
              pane.state === 'idle' && 'bg-[var(--text-muted)] opacity-30',
            )}
            data-testid="agent-status-light"
          />
          {pane.cwd ? (
            <span className="max-w-40 truncate text-[10px] tracking-wide text-[var(--text-muted)]">
              {resolveCwdLabel(pane.cwd)}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          <span className="mr-0.5 text-[9px] uppercase tracking-widest text-[var(--text-muted)] opacity-30">
            {pane.shellLabel}
          </span>
          {onAddPane ? (
            <div className="terminal-glass-panel flex items-center px-0.5">
              <button
                aria-label="新建终端"
                className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
                onClick={onAddPane}
                title="新建终端"
                type="button"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
          {onRemove ? (
            <button
              aria-label="关闭终端"
              className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
              onClick={onRemove}
              title="关闭终端"
              type="button"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Terminal viewport — pool-managed container gets mounted here */}
      <div
        className="terminal-pane-viewport min-h-0 flex-1"
        onClick={handleViewportClick}
        ref={viewportRef}
      />
    </div>
  )
})

function resolveSessionName(pane: TerminalPaneDescriptor, index: number): string {
  if (pane.cwd) {
    const cwdLabel = resolveCwdLabel(pane.cwd)
    if (cwdLabel.length > 0 && cwdLabel !== pane.shellLabel) {
      return cwdLabel
    }
  }
  return `终端 ${index + 1}`
}

function resolveCwdLabel(cwd: string): string {
  const segments = cwd.split('/').filter(Boolean)
  return segments.at(-1) ?? cwd
}
