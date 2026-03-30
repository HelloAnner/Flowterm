import '@xterm/xterm/css/xterm.css'

import { type ReactElement, useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Rows2, X } from 'lucide-react'

import {
  pickLeadingAgentStatus,
  resolveAgentStatusCopy,
} from '../features/workspace/agent-status'
import { subscribeTerminalOutput } from '../features/workspace/terminal-stream'
import { createTerminalResizeScheduler } from '../features/workspace/terminal-resize'
import { cn } from '../lib/utils'
import type { AgentStatusSnapshot, TerminalState } from '../lib/contracts'

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
  onAddPane: () => void
  onLayout: (sizes: number[]) => void
  onRemovePane: (paneId: string) => void
  paneSizes: number[]
  panes: TerminalPaneDescriptor[]
  resizeTerminal: (sessionId: string, cols: number, rows: number) => Promise<void>
  theme: {
    background: string
    cursor: string
    foreground: string
  }
  writeTerminal: (sessionId: string, data: string) => Promise<void>
}

export function WorkspaceTerminal({
  onAddPane,
  onLayout,
  onRemovePane,
  paneSizes,
  panes,
  resizeTerminal,
  theme,
  writeTerminal,
}: WorkspaceTerminalProps): ReactElement {
  const bannerStatus = pickLeadingAgentStatus(panes.map((pane) => pane.agentStatus))
  const bannerCopy = bannerStatus ? resolveAgentStatusCopy(bannerStatus) : null

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--terminal-bg)]">
      <div className="flex h-7 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4">
        <span className="font-mono text-[11px] text-[var(--text-muted)]">终端</span>
        {panes.length < 3 ? (
          <button
            className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            onClick={onAddPane}
            title="分割终端"
            type="button"
          >
            <Rows2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {bannerCopy ? (
        <div className="flex h-7 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] px-4">
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
      <PanelGroup
        className="min-h-0 flex-1"
        direction="vertical"
        key={`${panes[0]?.projectId ?? 'terminal'}-${panes.map((pane) => pane.id).join(':')}`}
        onLayout={onLayout}
      >
        {panes.flatMap((pane, index) =>
          [
            index > 0 ? (
              <PanelResizeHandle
                className="group h-1 shrink-0 bg-[var(--terminal-divider)] data-[resize-handle-active]:bg-[var(--border-subtle)]"
                key={`handle-${pane.id}`}
              >
                <span className="block h-px bg-[var(--terminal-divider-strong)] group-hover:bg-[var(--border-subtle)]" />
              </PanelResizeHandle>
            ) : null,
            <Panel
              defaultSize={paneSizes[index]}
              key={pane.id}
              minSize={15}
            >
              <TerminalPane
                onRemove={panes.length > 1 ? () => onRemovePane(pane.id) : null}
                pane={pane}
                resizeTerminal={resizeTerminal}
                theme={theme}
                writeTerminal={writeTerminal}
              />
            </Panel>,
          ].filter(Boolean),
        )}
      </PanelGroup>
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
      fontSize: 13,
      lineHeight: 1.35,
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
      terminal.reset()
      terminal.write(pane.history)
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
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-7 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4">
        <span className={cn('text-xs font-medium', resolveTerminalTone(pane.state))}>
          {resolveTerminalLabel(pane.state)}
        </span>
        <div className="flex items-center gap-2">
          {pane.cwd ? (
            <span className="max-w-40 truncate font-mono text-[11px] text-[var(--text-muted)]">
              {pane.cwd.split('/').pop()}
            </span>
          ) : null}
          <span className="font-mono text-[11px] text-[var(--text-muted)]">{pane.shellLabel}</span>
          {onRemove ? (
            <button
              className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              onClick={onRemove}
              type="button"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 p-3" ref={containerRef} />
    </div>
  )
}

function resolveTerminalLabel(state: TerminalState): string {
  if (state === 'attention') {
    return '等待你的输入'
  }
  if (state === 'exited') {
    return '已关闭'
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
