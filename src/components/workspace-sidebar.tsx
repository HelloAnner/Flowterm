import { FolderTree } from 'lucide-react'
import { type ReactElement, type ReactNode, useMemo } from 'react'

import { summarizeProjectSnapshot } from '../features/workspace/tree'
import type { ProjectFileEntry } from '../lib/contracts'
import { cn } from '../lib/utils'

export type WorkspaceSidebarView = 'tree'

interface WorkspaceSidebarProps {
  children: ReactNode
  files: ProjectFileEntry[]
  onSelectView: (view: WorkspaceSidebarView) => void
  selectedView: WorkspaceSidebarView
}

export function WorkspaceSidebar({
  children,
  files,
  onSelectView,
  selectedView,
}: WorkspaceSidebarProps): ReactElement {
  const summary = useMemo(() => summarizeProjectSnapshot(files), [files])

  return (
    <div className="flex h-full min-h-0 bg-[var(--bg-elevated)]">
      <nav className="flex w-14 shrink-0 flex-col items-center border-r border-[var(--border-subtle)] bg-[linear-gradient(180deg,rgba(200,169,110,0.06),rgba(15,15,15,0))] px-2 py-3">
        <button
          aria-label={`文件树，${summary.totalFileCount} 个文件，${summary.changedFileCount} 个改动`}
          className={cn(
            'group relative flex w-full flex-col items-center gap-1.5 rounded-2xl border px-1 py-3 text-[var(--text-secondary)] transition-colors',
            selectedView === 'tree'
              ? 'border-[rgba(200,169,110,0.36)] bg-[rgba(200,169,110,0.09)] text-[var(--text-primary)] shadow-[0_12px_24px_rgba(0,0,0,0.24)]'
              : 'border-transparent hover:border-[var(--border-default)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]',
          )}
          onClick={() => onSelectView('tree')}
          title={`文件树 · ${summary.totalFileCount} / ${summary.changedFileCount}`}
          type="button"
        >
          {summary.hasLiveActivity ? (
            <span className="absolute left-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--accent-sage)] shadow-[0_0_10px_rgba(122,158,138,0.85)]" />
          ) : null}
          {summary.changedFileCount > 0 ? (
            <span className="absolute right-1 top-1 rounded-full bg-[rgba(200,169,110,0.18)] px-1.5 py-0.5 font-mono text-[9px] leading-none text-[var(--accent-amber)]">
              {summary.changedFileCount}
            </span>
          ) : null}
          <FolderTree className="h-4 w-4 shrink-0" />
          <span className="font-mono text-[10px] leading-none text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]">
            {summary.totalFileCount}
          </span>
        </button>
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
