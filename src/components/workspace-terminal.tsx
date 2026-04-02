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
import type { TerminalTypography } from '../features/workspace/terminal-preferences'
import {
  acquireTerminal,
  releaseTerminal,
  updatePoolTheme,
  updatePoolTypography,
} from '../features/workspace/terminal-pool'
import type { AgentStatusSnapshot, TerminalState } from '../lib/contracts'
import { TerminalSideRail, type TerminalSideSession } from './terminal-side-rail'

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
  onAddPane: () => void
  onRemovePane: (paneId: string) => void
  onSelectPane: (paneId: string) => void
  onSetRailWidth: (width: number) => void
  panes: TerminalPaneDescriptor[]
  railWidth: number
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
  onAddPane,
  onRemovePane,
  onSelectPane,
  onSetRailWidth,
  panes,
  railWidth,
  resizeTerminal,
  theme,
  typography,
  writeTerminal,
}: WorkspaceTerminalProps): ReactElement {
  const activePane = useMemo(
    () => panes.find((p) => p.id === activePaneId) ?? panes[0] ?? null,
    [panes, activePaneId],
  )

  const sideSessions = useMemo<TerminalSideSession[]>(
    () =>
      panes.map((pane, index) => ({
        id: pane.id,
        name: resolveSessionName(pane, index),
        shellLabel: pane.shellLabel,
        state: pane.state,
      })),
    [panes],
  )

  // Auto-select first pane when active is missing
  useEffect(() => {
    if (panes.length > 0 && !activePaneId) {
      onSelectPane(panes[0].id)
    } else if (activePaneId && !panes.find((p) => p.id === activePaneId) && panes.length > 0) {
      onSelectPane(panes[0].id)
    }
  }, [panes, activePaneId, onSelectPane])

  return (
    <div className="terminal-surface flex h-full min-h-0 flex-row m-2.5">
      {/* Terminal viewport — always full area */}
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {activePane ? (
          <TerminalPane
            key={activePane.id}
            pane={activePane}
            resizeTerminal={resizeTerminal}
            theme={theme}
            typography={typography}
            writeTerminal={writeTerminal}
          />
        ) : null}
      </div>

      {/* Right sidebar */}
      {panes.length > 0 ? (
        <TerminalSideRail
          activeSessionId={activePane?.id ?? null}
          onAddSession={onAddPane}
          onRemoveSession={onRemovePane}
          onSelectSession={onSelectPane}
          onSetWidth={onSetRailWidth}
          sessions={sideSessions}
          width={railWidth}
        />
      ) : null}
    </div>
  )
})

interface TerminalPaneProps {
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

    // Mount + fit + focus — double-rAF ensures layout is settled before measuring
    viewport.appendChild(pooled.container)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        pooled.fitAddon.fit()
        const dimensions = pooled.fitAddon.proposeDimensions()
        if (dimensions) {
          pooled.resizeScheduler({ cols: dimensions.cols, rows: dimensions.rows })
        }
        pooled.terminal.focus()
      })
    })

    // Ongoing resize
    const observer = new ResizeObserver(() => {
      pooled.fitAddon.fit()
      const dimensions = pooled.fitAddon.proposeDimensions()
      if (dimensions) {
        pooled.resizeScheduler({ cols: dimensions.cols, rows: dimensions.rows })
      }
    })
    observer.observe(viewport)

    return () => {
      observer.disconnect()
      releaseTerminal(pane.sessionId)
      pooledRef.current = null
    }
  }, [pane.sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { updatePoolTheme(theme) }, [theme])
  useEffect(() => { updatePoolTypography(typography) }, [typography])

  // Re-focus terminal when pane becomes visible again (e.g., switching tabs)
  useEffect(() => {
    pooledRef.current?.terminal.focus()
  })

  // mousedown captures focus before any TUI app (Claude Code, etc.) can intercept
  const handleViewportMouseDown = useCallback(() => {
    pooledRef.current?.terminal.focus()
  }, [])

  return (
    <div
      className="terminal-pane-viewport h-full min-h-0 w-full"
      onMouseDown={handleViewportMouseDown}
      ref={viewportRef}
    />
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
