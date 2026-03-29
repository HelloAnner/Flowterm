import type { TerminalOutputEvent } from '../../lib/contracts'

type TerminalOutputListener = (chunk: string) => void

interface TerminalStreamEntry {
  backlog: string
  listeners: Set<TerminalOutputListener>
}

const terminalStreams = new Map<string, TerminalStreamEntry>()

export function publishTerminalOutput(event: TerminalOutputEvent): void {
  const entry = ensureTerminalStream(event.sessionId)

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

    if (currentEntry.listeners.size === 0 && currentEntry.backlog.length === 0) {
      terminalStreams.delete(sessionId)
    }
  }
}

function ensureTerminalStream(sessionId: string): TerminalStreamEntry {
  const existing = terminalStreams.get(sessionId)

  if (existing) {
    return existing
  }

  const created: TerminalStreamEntry = {
    backlog: '',
    listeners: new Set(),
  }
  terminalStreams.set(sessionId, created)
  return created
}
