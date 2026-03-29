import '@xterm/xterm/css/xterm.css'

import { type ReactElement, useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'

import { cn } from '../lib/utils'
import type { TerminalState } from '../lib/contracts'

interface WorkspaceTerminalProps {
  history: string
  lastChunk: string | null
  projectId: string | null
  resizeTerminal: (projectId: string, cols: number, rows: number) => Promise<void>
  shellLabel: string
  state: TerminalState
  writeTerminal: (projectId: string, data: string) => Promise<void>
}

export function WorkspaceTerminal({
  history,
  lastChunk,
  projectId,
  resizeTerminal,
  shellLabel,
  state,
  writeTerminal,
}: WorkspaceTerminalProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const attachedProjectRef = useRef<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily:
        '"Berkeley Mono", "Geist Mono", "JetBrains Mono", ui-monospace, monospace',
      fontSize: 15,
      lineHeight: 1.6,
      theme: {
        background: '#0C0C0C',
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
      if (projectId) {
        void writeTerminal(projectId, data)
      }
    })

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        fitAddon.fit()
      })
      const dimensions = fitAddon.proposeDimensions()

      if (projectId && dimensions) {
        void resizeTerminal(projectId, dimensions.cols, dimensions.rows)
      }
    })

    observer.observe(containerRef.current)
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    return () => {
      observer.disconnect()
      terminal.dispose()
    }
  }, [projectId, resizeTerminal, writeTerminal])

  useEffect(() => {
    const terminal = terminalRef.current
    const fitAddon = fitAddonRef.current

    if (!terminal || !fitAddon || !projectId) {
      return
    }

    if (attachedProjectRef.current !== projectId) {
      terminal.reset()
      terminal.write(history)
      requestAnimationFrame(() => {
        fitAddon.fit()
      })
      attachedProjectRef.current = projectId
      const dimensions = fitAddon.proposeDimensions()

      if (dimensions) {
        void resizeTerminal(projectId, dimensions.cols, dimensions.rows)
      }
    }
  }, [history, projectId, resizeTerminal])

  useEffect(() => {
    if (!lastChunk || !projectId || attachedProjectRef.current !== projectId) {
      return
    }

    terminalRef.current?.write(lastChunk)
  }, [lastChunk, projectId])

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--terminal-bg)]">
      <div className="flex h-7 items-center gap-3 border-b border-[var(--border-subtle)] bg-[#111111] px-4 text-xs">
        <span className={cn('font-medium', resolveTerminalTone(state))}>
          {resolveTerminalLabel(state)}
        </span>
        <span className="text-[var(--text-muted)]">{shellLabel}</span>
      </div>
      <div className="min-h-0 flex-1 px-4 py-3">
        <div className="h-full w-full rounded-md border border-[var(--border-subtle)] bg-black/10">
          <div className="h-full w-full p-2" ref={containerRef} />
        </div>
      </div>
    </div>
  )
}

function resolveTerminalLabel(state: TerminalState): string {
  if (state === 'attention') {
    return '等待你的输入'
  }
  if (state === 'running') {
    return '终端会话运行中'
  }
  return '终端已就绪'
}

function resolveTerminalTone(state: TerminalState): string {
  if (state === 'attention') {
    return 'text-[var(--accent-amber)]'
  }
  if (state === 'running') {
    return 'text-[var(--accent-sage)]'
  }
  return 'text-[var(--text-secondary)]'
}
