import '@xterm/xterm/css/xterm.css'

import { type ReactElement, useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Plus, SplitSquareVertical, X } from 'lucide-react'

import {
  pickLeadingAgentStatus,
  resolveAgentStatusCopy,
} from '../features/workspace/agent-status'
import {
  claimTerminalHistory,
  subscribeTerminalOutput,
} from '../features/workspace/terminal-stream'
import { createTerminalResizeScheduler } from '../features/workspace/terminal-resize'
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
  onSetRailWidth: (width: number) => void
  onToggleSplitView: () => void
  paneSizes: number[]
  panes: TerminalPaneDescriptor[]
  railWidth: number
  resizeTerminal: (sessionId: string, cols: number, rows: number) => Promise<void>
  theme: {
    background: string
    cursor: string
    foreground: string
  }
  writeTerminal: (sessionId: string, data: string) => Promise<void>
}

export function WorkspaceTerminal({
  activePaneId,
  isSplitView,
  onAddPane,
  onLayout,
  onRemovePane,
  onSelectPane,
  onSetRailWidth,
  onToggleSplitView,
  paneSizes,
  panes,
  railWidth,
  resizeTerminal,
  theme,
  writeTerminal,
}: WorkspaceTerminalProps): ReactElement {
  const bannerStatus = pickLeadingAgentStatus(panes.map((pane) => pane.agentStatus))
  const bannerCopy = bannerStatus ? resolveAgentStatusCopy(bannerStatus) : null
  const canAddPane = panes.length < 3

  const sessions: TerminalSession[] = panes.map((pane) => ({
    id: pane.id,
    name: resolveSessionName(pane, panes.indexOf(pane)),
    shellLabel: pane.shellLabel,
    state: pane.state,
  }))

  const hasMultiplePanes = panes.length > 1
  const showAllPanes = isSplitView || !hasMultiplePanes || !activePaneId
  const visiblePanes = showAllPanes ? panes : panes.filter((pane) => pane.id === activePaneId)
  const visiblePaneSizes = showAllPanes ? paneSizes : [100]

  useEffect(() => {
    if (panes.length > 0 && !activePaneId) {
      onSelectPane(panes[0].id)
    } else if (activePaneId && !panes.find((p) => p.id === activePaneId) && panes.length > 0) {
      // Active pane was removed, select first available
      onSelectPane(panes[0].id)
    }
  }, [panes, activePaneId, onSelectPane])

  const handleAddPane = (): void => {
    onAddPane()
  }

  return (
    <div className="terminal-surface flex h-full min-h-0 flex-col bg-[var(--terminal-bg)]">
      <div className="terminal-toolbar flex h-8 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-3">
        <span className="font-mono text-[11px] text-[var(--text-muted)]">终端</span>
        <div className="terminal-glass-panel flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] p-0.5">
          <button
            aria-label={panes.length === 0 ? '新建终端' : '垂直分屏'}
            className={cn(
              'terminal-toolbar-button rounded-md p-1 text-[var(--text-muted)]',
              !canAddPane && 'cursor-not-allowed opacity-40',
            )}
            disabled={!canAddPane}
            onClick={handleAddPane}
            title={panes.length === 0 ? '新建终端' : '垂直分屏'}
            type="button"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          {hasMultiplePanes && (
            <button
              aria-label="切换终端布局"
              className={cn(
                'terminal-toolbar-button rounded-md p-1 text-[var(--text-muted)]',
                isSplitView && 'bg-[rgba(200,169,110,0.14)] text-[var(--accent-amber)]',
              )}
              onClick={onToggleSplitView}
              title={isSplitView ? '聚焦当前终端' : '显示全部分屏'}
              type="button"
            >
              <SplitSquareVertical className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {bannerCopy ? (
        <div className="terminal-glass-panel flex h-7 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-4">
          <span
            aria-hidden="true"
            className={cn(
              'h-2 w-2 rounded-full',
              bannerCopy.tone === 'attention' &&
                'bg-[var(--accent-amber)] shadow-[0_0_10px_rgba(200,169,110,0.35)]',
              bannerCopy.tone === 'active' &&
                'animate-pulse bg-[var(--accent-sage)] shadow-[0_0_10px_rgba(122,158,138,0.35)]',
              bannerCopy.tone === 'settled' &&
                'bg-[var(--text-secondary)] shadow-[0_0_8px_rgba(138,134,128,0.18)]',
            )}
          />
          <span className="text-xs font-medium text-[var(--text-primary)]">{bannerCopy.title}</span>
          <span className="text-[11px] text-[var(--text-secondary)]">{bannerCopy.detail}</span>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-h-0 flex-1">
          {visiblePanes.length > 1 ? (
            <PanelGroup
              className="h-full"
              direction="vertical"
              key={`${visiblePanes[0]?.projectId ?? 'terminal'}-${visiblePanes.map((pane) => pane.id).join(':')}`}
              onLayout={onLayout}
            >
              {visiblePanes.flatMap((pane, index) =>
                [
                  index > 0 ? (
                    <PanelResizeHandle
                      className="group h-2 shrink-0 bg-transparent px-3 py-0.5 data-[resize-handle-active]:bg-transparent"
                      key={`handle-${pane.id}`}
                    >
                      <span className="block h-px rounded-full bg-[var(--terminal-divider-strong)] opacity-70 transition-opacity group-hover:opacity-100" />
                    </PanelResizeHandle>
                  ) : null,
                  <Panel
                    defaultSize={visiblePaneSizes[index]}
                    key={pane.id}
                    minSize={15}
                  >
                    <TerminalPane
                      onRemove={visiblePanes.length > 1 ? () => onRemovePane(pane.id) : null}
                      pane={pane}
                      resizeTerminal={resizeTerminal}
                      theme={theme}
                      writeTerminal={writeTerminal}
                    />
                  </Panel>,
                ].filter(Boolean),
              )}
            </PanelGroup>
          ) : visiblePanes.length === 1 ? (
            <TerminalPane
              onRemove={panes.length > 1 ? () => onRemovePane(visiblePanes[0].id) : null}
              pane={visiblePanes[0]}
              resizeTerminal={resizeTerminal}
              theme={theme}
              writeTerminal={writeTerminal}
            />
          ) : null}
        </div>

        {panes.length > 1 && (
          <TerminalSessionRail
            activeSessionId={activePaneId ?? panes[0]?.id}
            onAddSession={handleAddPane}
            onRemoveSession={onRemovePane}
            onRenameSession={() => {}}
            onSelectSession={onSelectPane}
            onWidthChange={onSetRailWidth}
            sessions={sessions}
            width={railWidth}
          />
        )}
      </div>
    </div>
  )
}

interface TerminalPaneProps {
  onRemove: (() => void) | null
  pane: TerminalPaneDescriptor
  resizeTerminal: (sessionId: string, cols: number, rows: number) => Promise<void>
  theme: {
    background: string
    cursor: string
    foreground: string
  }
  writeTerminal: (sessionId: string, data: string) => Promise<void>
}

function TerminalPane({
  onRemove,
  pane,
  resizeTerminal,
  theme,
  writeTerminal,
}: TerminalPaneProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const resizeSchedulerRef = useRef<ReturnType<typeof createTerminalResizeScheduler> | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const attachedSessionRef = useRef<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily:
        '"Berkeley Mono", "Geist Mono", "JetBrains Mono", ui-monospace, monospace',
      fontSize: 12,
      letterSpacing: -0.6,
      lineHeight: 1.22,
      theme,
    })
    const fitAddon = new FitAddon()
    const scheduleResize = createTerminalResizeScheduler((dimensions) => {
      void resizeTerminal(pane.sessionId, dimensions.cols, dimensions.rows)
    })

    terminal.loadAddon(fitAddon)
    terminal.open(containerRef.current)
    requestAnimationFrame(() => {
      fitAddon.fit()
    })

    terminal.onData((data) => {
      void writeTerminal(pane.sessionId, data)
    })

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        fitAddon.fit()
      })
      const dimensions = fitAddon.proposeDimensions()

      if (dimensions) {
        scheduleResize({
          cols: dimensions.cols,
          rows: dimensions.rows,
        })
      }
    })

    observer.observe(containerRef.current)
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon
    resizeSchedulerRef.current = scheduleResize

    return () => {
      observer.disconnect()
      scheduleResize.cancel()
      resizeSchedulerRef.current = null
      terminal.dispose()
    }
  }, [pane.sessionId, resizeTerminal, theme, writeTerminal])

  useEffect(() => {
    const terminal = terminalRef.current
    const fitAddon = fitAddonRef.current

    if (!terminal || !fitAddon) {
      return
    }

    if (attachedSessionRef.current !== pane.sessionId) {
      const terminalHistory = claimTerminalHistory(pane.sessionId, pane.history)
      terminal.reset()
      terminal.write(terminalHistory)
      requestAnimationFrame(() => {
        fitAddon.fit()
      })
      attachedSessionRef.current = pane.sessionId
      const dimensions = fitAddon.proposeDimensions()

      if (dimensions) {
        resizeSchedulerRef.current?.({
          cols: dimensions.cols,
          rows: dimensions.rows,
        })
      }
    }
  }, [pane.history, pane.sessionId, resizeTerminal])

  useEffect(() => {
    if (attachedSessionRef.current !== pane.sessionId) {
      return
    }

    return subscribeTerminalOutput(pane.sessionId, (chunk) => {
      terminalRef.current?.write(chunk)
    })
  }, [pane.sessionId])

  return (
    <div className="terminal-pane-shell flex h-full min-h-0 flex-col">
      <div className="terminal-pane-header flex h-8 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className={cn(
              'h-1.5 w-1.5 shrink-0 rounded-full',
              pane.state === 'attention' && 'bg-[var(--accent-amber)] shadow-[0_0_8px_rgba(200,169,110,0.4)]',
              pane.state === 'running' && 'bg-[var(--accent-sage)] shadow-[0_0_8px_rgba(122,158,138,0.38)]',
              pane.state === 'exited' && 'bg-[var(--accent-clay)]',
              pane.state === 'idle' && 'bg-[var(--text-muted)]',
            )}
          />
          <span className={cn('text-[11px] font-medium tracking-[0.01em]', resolveTerminalTone(pane.state))}>
            {resolveTerminalLabel(pane.state)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {pane.cwd ? (
            <span className="terminal-chip max-w-40 truncate rounded-md px-2 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
              {resolveCwdLabel(pane.cwd)}
            </span>
          ) : null}
          <span className="rounded-md border border-[var(--border-subtle)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {pane.shellLabel}
          </span>
          {onRemove ? (
            <button
              aria-label="关闭终端"
              className="terminal-chip-button rounded-md p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              onClick={onRemove}
              title="关闭终端"
              type="button"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="terminal-pane-viewport min-h-0 flex-1 px-4 pb-4 pt-3" ref={containerRef} />
    </div>
  )
}

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

function resolveTerminalLabel(state: TerminalState): string {
  if (state === 'attention') {
    return '等待输入'
  }
  if (state === 'exited') {
    return '已退出'
  }
  if (state === 'running') {
    return '运行中'
  }
  return '就绪'
}

function resolveTerminalTone(state: TerminalState): string {
  if (state === 'attention') {
    return 'text-[var(--accent-amber)]'
  }
  if (state === 'exited') {
    return 'text-[var(--accent-clay)]'
  }
  if (state === 'running') {
    return 'text-[var(--accent-sage)]'
  }
  return 'text-[var(--text-muted)]'
}
