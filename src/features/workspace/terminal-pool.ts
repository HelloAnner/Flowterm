import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'

import { createTerminalResizeScheduler } from './terminal-resize'
import {
  claimTerminalHistory,
  subscribeTerminalOutput,
} from './terminal-stream'

const MAX_POOL_SIZE = 10
const FONT_FAMILY =
  '"Berkeley Mono", "Geist Mono", "JetBrains Mono", ui-monospace, monospace'

export interface TerminalTheme {
  background: string
  cursor: string
  foreground: string
}

export interface TerminalTypographyConfig {
  fontSize: number
  letterSpacing: number
  lineHeight: number
}

export interface PooledTerminal {
  container: HTMLDivElement
  fitAddon: FitAddon
  resizeScheduler: ReturnType<typeof createTerminalResizeScheduler>
  sessionId: string
  terminal: Terminal
  unsubscribeOutput: (() => void) | null
}

type ResizeHandler = (sessionId: string, cols: number, rows: number) => Promise<void>
type WriteHandler = (sessionId: string, data: string) => Promise<void>

const pool = new Map<string, PooledTerminal>()
const accessOrder: string[] = []

function touchAccessOrder(sessionId: string): void {
  const index = accessOrder.indexOf(sessionId)
  if (index !== -1) accessOrder.splice(index, 1)
  accessOrder.push(sessionId)
}

function evictIfNeeded(): void {
  while (pool.size > MAX_POOL_SIZE && accessOrder.length > 0) {
    const oldest = accessOrder.shift()!
    destroyInstance(oldest)
  }
}

function destroyInstance(sessionId: string): void {
  const instance = pool.get(sessionId)
  if (!instance) return

  instance.unsubscribeOutput?.()
  instance.resizeScheduler.cancel()
  instance.terminal.dispose()
  instance.container.remove()
  pool.delete(sessionId)

  const idx = accessOrder.indexOf(sessionId)
  if (idx !== -1) accessOrder.splice(idx, 1)
}

export function acquireTerminal(
  sessionId: string,
  initialHistory: string,
  theme: TerminalTheme,
  typography: TerminalTypographyConfig,
  resizeTerminal: ResizeHandler,
  writeTerminal: WriteHandler,
): PooledTerminal {
  const existing = pool.get(sessionId)
  if (existing) {
    touchAccessOrder(sessionId)
    return existing
  }

  const container = document.createElement('div')
  container.className = 'terminal-pool-viewport'
  container.style.width = '100%'
  container.style.height = '100%'

  const terminal = new Terminal({
    cursorBlink: true,
    fontFamily: FONT_FAMILY,
    fontSize: typography.fontSize,
    letterSpacing: typography.letterSpacing,
    lineHeight: typography.lineHeight,
    theme: {
      background: theme.background,
      foreground: theme.foreground,
      cursor: theme.cursor,
      selectionBackground: `${theme.cursor}40`,
      selectionForeground: theme.foreground,
    },
  })

  const fitAddon = new FitAddon()
  const resizeScheduler = createTerminalResizeScheduler((dimensions) => {
    void resizeTerminal(sessionId, dimensions.cols, dimensions.rows)
  })

  terminal.loadAddon(fitAddon)
  terminal.open(container)

  try {
    const webglAddon = new WebglAddon()
    webglAddon.onContextLoss(() => webglAddon.dispose())
    terminal.loadAddon(webglAddon)
  } catch {
    // WebGL unavailable — DOM renderer fallback
  }

  terminal.onData((data) => {
    void writeTerminal(sessionId, data)
  })

  // Seed history
  const history = claimTerminalHistory(sessionId, initialHistory)
  terminal.write(history)

  // Subscribe to live output
  const unsubscribeOutput = subscribeTerminalOutput(sessionId, (chunk) => {
    terminal.write(chunk)
  })

  const instance: PooledTerminal = {
    container,
    fitAddon,
    resizeScheduler,
    sessionId,
    terminal,
    unsubscribeOutput,
  }

  pool.set(sessionId, instance)
  touchAccessOrder(sessionId)
  evictIfNeeded()

  return instance
}

export function releaseTerminal(sessionId: string): void {
  // Keep in pool — just detach container from DOM parent if mounted
  const instance = pool.get(sessionId)
  if (instance?.container.parentElement) {
    instance.container.remove()
  }
}

export function destroyTerminal(sessionId: string): void {
  destroyInstance(sessionId)
}

export function updatePoolTheme(theme: TerminalTheme): void {
  for (const instance of pool.values()) {
    instance.terminal.options.theme = {
      background: theme.background,
      foreground: theme.foreground,
      cursor: theme.cursor,
      selectionBackground: `${theme.cursor}40`,
      selectionForeground: theme.foreground,
    }
  }
}

export function updatePoolTypography(typography: TerminalTypographyConfig): void {
  for (const instance of pool.values()) {
    instance.terminal.options.fontSize = typography.fontSize
    instance.terminal.options.letterSpacing = typography.letterSpacing
    instance.terminal.options.lineHeight = typography.lineHeight
    requestAnimationFrame(() => {
      instance.fitAddon.fit()
    })
  }
}

export function getPoolSize(): number {
  return pool.size
}

export function clearPool(): void {
  for (const sessionId of [...pool.keys()]) {
    destroyInstance(sessionId)
  }
}
