import { useState, useRef, useEffect } from 'react'
import { Terminal, X, Plus } from 'lucide-react'
import { cn } from '../lib/utils'
import type { TerminalState } from '../lib/contracts'

export interface TerminalSession {
  id: string
  name: string
  state: TerminalState
  shellLabel: string
}

interface TerminalSessionRailProps {
  activeSessionId: string | null
  onAddSession: () => void
  onRemoveSession: (sessionId: string) => void
  onSelectSession: (sessionId: string) => void
  onRenameSession: (sessionId: string, newName: string) => void
  onWidthChange: (width: number) => void
  sessions: TerminalSession[]
  width: number
}

const MIN_WIDTH = 44
const COMFORT_WIDTH = 160
const MAX_WIDTH = 240

export function TerminalSessionRail({
  activeSessionId,
  onAddSession,
  onRemoveSession,
  onSelectSession,
  onRenameSession,
  onWidthChange,
  sessions,
  width,
}: TerminalSessionRailProps): React.ReactElement {
  const [isResizing, setIsResizing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const railRef = useRef<HTMLDivElement>(null)
  const startXRef = useRef(0)
  const startWidthRef = useRef(width)

  const isCompact = width < COMFORT_WIDTH

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent): void => {
      const delta = e.clientX - startXRef.current
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidthRef.current + delta))
      onWidthChange(newWidth)
    }

    const handleMouseUp = (): void => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, onWidthChange])

  const handleResizeStart = (e: React.MouseEvent): void => {
    e.preventDefault()
    startXRef.current = e.clientX
    startWidthRef.current = width
    setIsResizing(true)
  }

  const startEditing = (session: TerminalSession): void => {
    setEditingId(session.id)
    setEditingName(session.name)
  }

  const commitRename = (): void => {
    if (editingId && editingName.trim()) {
      onRenameSession(editingId, editingName.trim())
    }
    setEditingId(null)
    setEditingName('')
  }

  const cancelRename = (): void => {
    setEditingId(null)
    setEditingName('')
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      commitRename()
    } else if (e.key === 'Escape') {
      cancelRename()
    }
  }

  return (
    <div
      ref={railRef}
      className="terminal-session-rail relative flex h-full shrink-0 flex-col border-l border-[var(--border-subtle)] bg-[var(--rail-bg)]"
      style={{ width }}
    >
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-2.5">
        {!isCompact && (
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
            Panes
          </span>
        )}
        <button
          aria-label="垂直分屏"
          className="terminal-toolbar-button ml-auto rounded-md p-1 text-[var(--text-muted)]"
          onClick={onAddSession}
          title="垂直分屏"
          type="button"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1.5 py-2">
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId
          const isEditing = editingId === session.id

          return (
            <div
              key={session.id}
              className={cn(
                'group relative flex cursor-pointer items-center gap-2 transition-all',
                isCompact ? 'justify-center rounded-xl px-0 py-2.5' : 'rounded-xl px-2.5 py-2',
                isActive
                  ? 'border border-[var(--rail-active-border)] bg-[var(--rail-active-bg)] shadow-[inset_0_1px_0_var(--terminal-glass-strong)]'
                  : 'border border-transparent hover:border-[var(--border-default)] hover:bg-[var(--rail-hover-bg)]',
              )}
              onClick={() => onSelectSession(session.id)}
              title={isCompact ? `${session.name} · ${session.shellLabel}` : undefined}
            >
              <span
                className={cn(
                  'shrink-0 rounded-full transition-transform',
                  isCompact ? 'absolute right-2 top-2 h-1.5 w-1.5' : 'h-1.5 w-1.5',
                  session.state === 'attention' && 'bg-[var(--accent-amber)]',
                  session.state === 'running' && 'animate-pulse bg-[var(--accent-sage)]',
                  session.state === 'exited' && 'bg-[var(--accent-clay)]',
                  session.state === 'idle' && 'bg-[var(--text-muted)]',
                )}
              />

              {isCompact ? (
                <Terminal
                  className={cn(
                    'h-3.5 w-3.5 transition-colors',
                    isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]',
                  )}
                />
              ) : isEditing ? (
                <input
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-[var(--text-primary)] outline-none"
                  onBlur={commitRename}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  value={editingName}
                />
              ) : (
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate font-mono text-[11px] text-[var(--text-primary)]"
                    onDoubleClick={() => startEditing(session)}
                  >
                    {session.name}
                  </div>
                  <div className="truncate text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {session.shellLabel}
                  </div>
                </div>
              )}

              {(!isCompact || isActive) && sessions.length > 1 && (
                <button
                  aria-label="关闭终端"
                  className={cn(
                    'terminal-chip-button shrink-0 rounded-md p-1 text-[var(--text-muted)] opacity-0 transition-opacity hover:text-[var(--accent-clay)]',
                    isCompact ? 'absolute bottom-1 left-1/2 -translate-x-1/2 group-hover:opacity-100' : 'group-hover:opacity-100',
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveSession(session.id)
                  }}
                  title="关闭终端"
                  type="button"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div
        className={cn(
          'absolute inset-y-0 left-0 w-1 cursor-ew-resize transition-colors',
          isResizing ? 'bg-[var(--accent-amber)]' : 'hover:bg-[var(--interactive-hover)]',
        )}
        onMouseDown={handleResizeStart}
      />
    </div>
  )
}
