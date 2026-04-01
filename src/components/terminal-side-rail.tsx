import { memo, useCallback, useRef } from 'react'
import { GripVertical, Plus, TerminalSquare, X } from 'lucide-react'

import { cn } from '../lib/utils'
import type { TerminalState } from '../lib/contracts'

export interface TerminalSideSession {
  id: string
  name: string
  shellLabel: string
  state: TerminalState
}

interface TerminalSideRailProps {
  activeSessionId: string | null
  onAddSession: () => void
  onRemoveSession: (sessionId: string) => void
  onSelectSession: (sessionId: string) => void
  onSetWidth: (width: number) => void
  sessions: TerminalSideSession[]
  width: number
}

const MIN_WIDTH = 36
const MAX_WIDTH = 240

export const TerminalSideRail = memo(function TerminalSideRail({
  activeSessionId,
  onAddSession,
  onRemoveSession,
  onSelectSession,
  onSetWidth,
  sessions,
  width,
}: TerminalSideRailProps): React.ReactElement {
  const canRemove = sessions.length > 1
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const handleDragStart = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      dragRef.current = { startX: event.clientX, startWidth: width }

      // Prevent text selection across the page during drag
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'col-resize'

      function handleDragMove(moveEvent: MouseEvent): void {
        if (!dragRef.current) return
        const delta = dragRef.current.startX - moveEvent.clientX
        const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, dragRef.current.startWidth + delta))
        onSetWidth(next)
      }

      function handleDragEnd(): void {
        dragRef.current = null
        document.body.style.userSelect = ''
        document.body.style.cursor = ''
        window.removeEventListener('mousemove', handleDragMove)
        window.removeEventListener('mouseup', handleDragEnd)
      }

      window.addEventListener('mousemove', handleDragMove)
      window.addEventListener('mouseup', handleDragEnd)
    },
    [onSetWidth, width],
  )

  return (
    <nav
      aria-label="终端列表"
      className="terminal-side-rail relative flex shrink-0 flex-col"
      style={{ width: `${width}px` }}
    >
      {/* Drag handle */}
      <div
        className="resize-handle resize-handle--vertical group"
        onMouseDown={handleDragStart}
      >
        <GripVertical className="resize-handle__icon" />
      </div>

      {/* Terminal entries */}
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1 py-1.5">
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId

          return (
            <button
              aria-selected={isActive}
              className={cn(
                'terminal-side-rail__item group relative flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left transition-all',
                isActive
                  ? 'bg-[var(--rail-active-bg)] text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--rail-hover-bg)] hover:text-[var(--text-secondary)]',
              )}
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              title={`${session.name} · ${session.shellLabel}`}
              type="button"
            >
              {isActive ? (
                <span className="absolute left-0 inset-y-1 w-0.5 rounded-full bg-[var(--accent-amber)]" />
              ) : null}

              <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                <TerminalSquare className="h-3.5 w-3.5" />
                <span
                  className={cn(
                    'absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full',
                    session.state === 'attention' && 'bg-[var(--accent-amber)]',
                    session.state === 'running' && 'animate-pulse bg-[var(--accent-sage)]',
                    session.state === 'exited' && 'bg-[var(--accent-clay)]',
                    session.state === 'idle' && 'opacity-0',
                  )}
                />
              </span>

              {width >= 72 ? (
                <span className="min-w-0 flex-1 truncate text-[11px]">
                  {session.name}
                </span>
              ) : null}

              {canRemove ? (
                <span
                  aria-label={`关闭 ${session.name}`}
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:text-[var(--accent-clay)]"
                  onClick={(event) => {
                    event.stopPropagation()
                    onRemoveSession(session.id)
                  }}
                  role="button"
                  tabIndex={-1}
                >
                  <X className="h-3 w-3" />
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {/* Add terminal — bottom, visually separated */}
      <div className="shrink-0 border-t border-[var(--border-subtle)] px-1 py-1">
        <button
          aria-label="新建终端"
          className="flex h-7 w-full items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--rail-hover-bg)] hover:text-[var(--text-secondary)]"
          onClick={onAddSession}
          title="新建终端"
          type="button"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </nav>
  )
})
