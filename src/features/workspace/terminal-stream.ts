import type { TerminalOutputEvent } from '../../lib/contracts'

type TerminalOutputListener = (chunk: string) => void

interface TerminalStreamEntry {
  backlog: string
  history: string
  listeners: Set<TerminalOutputListener>
  seeded: boolean
}

const terminalStreams = new Map<string, TerminalStreamEntry>()
const MAX_TERMINAL_STREAM_HISTORY_CHARS = 40_000

export function publishTerminalOutput(event: TerminalOutputEvent): void {
  const entry = ensureTerminalStream(event.sessionId)
  entry.history = trimTerminalHistory(`${entry.history}${event.chunk}`)

  if (entry.listeners.size === 0) {
    entry.backlog = `${entry.backlog}${event.chunk}`
    return
  }

  for (const listener of entry.listeners) {
    listener(event.chunk)
  }
}

export function subscribeTerminalOutput(
  sessionId: string,
  listener: TerminalOutputListener,
): () => void {
  const entry = ensureTerminalStream(sessionId)
  entry.listeners.add(listener)

  if (entry.backlog) {
    listener(entry.backlog)
    entry.backlog = ''
  }

  return () => {
    const currentEntry = terminalStreams.get(sessionId)

    if (!currentEntry) {
      return
    }

    currentEntry.listeners.delete(listener)

    if (
      currentEntry.listeners.size === 0 &&
      currentEntry.backlog.length === 0 &&
      currentEntry.history.length === 0
    ) {
      terminalStreams.delete(sessionId)
    }
  }
}

export function claimTerminalHistory(sessionId: string, initialHistory: string): string {
  const entry = ensureTerminalStream(sessionId)

  if (initialHistory && !entry.seeded) {
    entry.history = trimTerminalHistory(`${initialHistory}${entry.history}`)
    entry.seeded = true
  }

  entry.backlog = ''
  return entry.history || initialHistory
}

export function clearTerminalStream(sessionId: string): void {
  terminalStreams.delete(sessionId)
}

function ensureTerminalStream(sessionId: string): TerminalStreamEntry {
  const existing = terminalStreams.get(sessionId)

  if (existing) {
    return existing
  }

  const created: TerminalStreamEntry = {
    backlog: '',
    history: '',
    listeners: new Set(),
    seeded: false,
  }
  terminalStreams.set(sessionId, created)
  return created
}

function trimTerminalHistory(history: string): string {
  if (history.length <= MAX_TERMINAL_STREAM_HISTORY_CHARS) {
    return history
  }

  return history.slice(history.length - MAX_TERMINAL_STREAM_HISTORY_CHARS)
}
