import '@xterm/xterm/css/xterm.css'

import { type ReactElement, useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Rows2, X } from 'lucide-react'

import { subscribeTerminalOutput } from '../features/workspace/terminal-stream'
import { cn } from '../lib/utils'
import type { TerminalState } from '../lib/contracts'

export interface TerminalPaneDescriptor {
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
  writeTerminal: (sessionId: string, data: string) => Promise<void>
}

export function WorkspaceTerminal({
  onAddPane,
  onLayout,
  onRemovePane,
  paneSizes,
  panes,
  resizeTerminal,
  writeTerminal,
}: WorkspaceTerminalProps): ReactElement {
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
                className="group h-1 shrink-0 bg-[#0a0a0a] data-[resize-handle-active]:bg-[var(--border-subtle)]"
                key={`handle-${pane.id}`}
              >
                <span className="block h-px bg-[#1c1c1c] group-hover:bg-[var(--border-subtle)]" />
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
  writeTerminal: (sessionId: string, data: string) => Promise<void>
}

function TerminalPane({
  onRemove,
  pane,
  resizeTerminal,
  writeTerminal,
}: TerminalPaneProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
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
      lineHeight: 1.6,
      theme: {
        background: '#0F0F0F',
        cursor: '#C8A96E',
        foreground: '#E8E3DC',
      },
    })
    const fitAddon = new FitAddon()

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
        void resizeTerminal(pane.sessionId, dimensions.cols, dimensions.rows)
      }
    })

    observer.observe(containerRef.current)
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    return () => {
      observer.disconnect()
      terminal.dispose()
    }
  }, [pane.sessionId, resizeTerminal, writeTerminal])

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
        void resizeTerminal(pane.sessionId, dimensions.cols, dimensions.rows)
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
  if (state === 'running') {
    return '运行中'
  }
  return '就绪'
}

function resolveTerminalTone(state: TerminalState): string {
  if (state === 'attention') {
    return 'text-[var(--accent-amber)]'
  }
  if (state === 'running') {
    return 'text-[var(--accent-sage)]'
  }
  return 'text-[var(--text-muted)]'
}
