import { memo } from 'react'
import { Plus, SplitSquareVertical, X } from 'lucide-react'
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
  canAdd: boolean
  isSplitView: boolean
  onAddSession: () => void
  onRemoveSession: (sessionId: string) => void
  onSelectSession: (sessionId: string) => void
  onToggleSplitView: () => void
  sessions: TerminalSession[]
}

export const TerminalSessionRail = memo(function TerminalSessionRail({
  activeSessionId,
  canAdd,
  isSplitView,
  onAddSession,
  onRemoveSession,
  onSelectSession,
  onToggleSplitView,
  sessions,
}: TerminalSessionRailProps): React.ReactElement {
  const canRemove = sessions.length > 1

  return (
    <div className="terminal-session-strip flex shrink-0 items-center gap-1 border-t border-[var(--border-subtle)] px-2 py-1.5">
      {/* Session chips */}
      {sessions.map((session) => {
        const isActive = session.id === activeSessionId

        return (
          <div
            key={session.id}
            className={cn(
              'terminal-chip group flex items-center gap-1.5 px-2.5 py-1 transition-all duration-200',
              isActive
                ? 'bg-[var(--rail-active-bg)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--rail-hover-bg)]',
            )}
            onClick={() => onSelectSession(session.id)}
            title={`${session.name} · ${session.shellLabel}`}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 shrink-0 rounded-full transition-all duration-200',
                session.state === 'attention' && 'bg-[var(--accent-amber)]',
                session.state === 'running' && 'animate-pulse bg-[var(--accent-sage)]',
                session.state === 'exited' && 'bg-[var(--accent-clay)]',
                session.state === 'idle' && 'bg-[var(--text-muted)] opacity-30',
              )}
            />
            <span className="max-w-24 truncate text-[10px]">{session.name}</span>
            {canRemove ? (
              <button
                aria-label={`关闭 ${session.name}`}
                className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:text-[var(--text-primary)]"
                onClick={(event) => {
                  event.stopPropagation()
                  onRemoveSession(session.id)
                }}
                type="button"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            ) : null}
          </div>
        )
      })}

      <div className="flex-1" />

      {/* Controls — glass pill at the right edge */}
      <div className="terminal-glass-panel flex items-center gap-0.5 px-1 py-0.5">
        {canAdd ? (
          <button
            aria-label="新建终端"
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
            onClick={onAddSession}
            title="新建终端"
            type="button"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <button
          aria-label="切换终端布局"
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded transition-colors',
            isSplitView
              ? 'text-[var(--accent-amber)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
          )}
          onClick={onToggleSplitView}
          title={isSplitView ? '聚焦当前终端' : '显示全部分屏'}
          type="button"
        >
          <SplitSquareVertical className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
})
