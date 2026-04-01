import { FolderTree, LayoutGrid, Settings2 } from 'lucide-react'
import { memo, type ReactElement, type ReactNode, useMemo } from 'react'

import { summarizeProjectSnapshot } from '../features/workspace/tree'
import type { ProjectFileEntry } from '../lib/contracts'
import { cn } from '../lib/utils'

export type WorkspaceSidebarView = 'board' | 'settings' | 'tree'

interface WorkspaceSidebarProps {
  cardCount?: number
  children: ReactNode
  files: ProjectFileEntry[]
  onSelectView: (view: WorkspaceSidebarView) => void
  selectedView: WorkspaceSidebarView
}

export const WorkspaceSidebar = memo(function WorkspaceSidebar({
  cardCount = 0,
  children,
  files,
  onSelectView,
  selectedView,
}: WorkspaceSidebarProps): ReactElement {
  const summary = useMemo(() => summarizeProjectSnapshot(files), [files])

  return (
    <div className="flex h-full min-h-0 bg-[var(--bg-elevated)]">
      <nav className="flex w-11 shrink-0 flex-col items-center border-r border-[var(--border-subtle)] bg-[var(--bg-base)] px-1.5 py-3">
        <button
          aria-label={`文件树，${summary.totalFileCount} 个文件，${summary.changedFileCount} 个改动`}
          className={cn(
            'group relative flex w-full flex-col items-center gap-1 rounded-lg p-2 text-[var(--text-muted)] transition-all',
            selectedView === 'tree'
              ? 'bg-[var(--rail-active-bg)] text-[var(--text-primary)]'
              : 'hover:bg-[var(--rail-hover-bg)] hover:text-[var(--text-secondary)]',
          )}
          onClick={() => onSelectView('tree')}
          title={`文件树 · ${summary.totalFileCount} / ${summary.changedFileCount}`}
          type="button"
        >
          {summary.hasLiveActivity ? (
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--accent-sage)]" />
          ) : null}
          {summary.changedFileCount > 0 ? (
            <span className="absolute right-1 top-1 rounded-full bg-[var(--rail-active-bg)] px-1 py-0 text-[9px] leading-none text-[var(--accent-amber)] font-medium">
              {summary.changedFileCount}
            </span>
          ) : null}
          <FolderTree className="h-4 w-4 shrink-0" />
        </button>
        <button
          aria-label={`知识看板${cardCount > 0 ? `，${cardCount} 张卡片` : ''}`}
          className={cn(
            'group relative mt-1 flex w-full flex-col items-center gap-1 rounded-lg p-2 text-[var(--text-muted)] transition-all',
            selectedView === 'board'
              ? 'bg-[var(--rail-active-bg)] text-[var(--text-primary)]'
              : 'hover:bg-[var(--rail-hover-bg)] hover:text-[var(--text-secondary)]',
          )}
          onClick={() => onSelectView('board')}
          title={`知识看板${cardCount > 0 ? ` · ${cardCount}` : ''}`}
          type="button"
        >
          {cardCount > 0 ? (
            <span className="absolute right-1 top-1 rounded-full bg-[var(--rail-active-bg)] px-1 py-0 text-[9px] leading-none text-[var(--accent-sage)] font-medium">
              {cardCount}
            </span>
          ) : null}
          <LayoutGrid className="h-4 w-4 shrink-0" />
        </button>
        <button
          aria-label="设置"
          className={cn(
            'mt-auto flex w-full flex-col items-center gap-1 rounded-lg p-2 text-[var(--text-muted)] transition-all',
            selectedView === 'settings'
              ? 'bg-[var(--rail-active-bg)] text-[var(--text-primary)]'
              : 'hover:bg-[var(--rail-hover-bg)] hover:text-[var(--text-secondary)]',
          )}
          onClick={() => onSelectView('settings')}
          title="设置"
          type="button"
        >
          <Settings2 className="h-4 w-4 shrink-0" />
        </button>
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
})
