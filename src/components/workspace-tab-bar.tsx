import type { ReactElement } from 'react'
import { Plus, X } from 'lucide-react'

import { Button } from './ui/button'
import { cn } from '../lib/utils'
import type { ProjectSummary } from '../lib/contracts'

interface WorkspaceTabBarProps {
  activeProjectId: string | null
  onAddProject: () => void
  onRemoveProject: (projectId: string) => void
  onSelectProject: (projectId: string) => void
  projects: ProjectSummary[]
}

export function WorkspaceTabBar({
  activeProjectId,
  onAddProject,
  onRemoveProject,
  onSelectProject,
  projects,
}: WorkspaceTabBarProps): ReactElement {
  return (
    <header className="flex h-9 items-stretch border-b border-[var(--border-subtle)] bg-[var(--bg-base)]">
      <div className="flex shrink-0 items-center px-4">
        <span className="select-none font-mono text-[11px] tracking-[0.14em] text-[var(--text-muted)] uppercase">
          flowterm
        </span>
      </div>
      <div className="h-full w-px bg-[var(--border-subtle)]" />
      <div className="flex min-w-0 flex-1 items-stretch">
        {projects.map((project) => {
          const isActive = project.id === activeProjectId

          return (
            <button
              className={cn(
                'group flex h-9 min-w-0 items-center gap-2 border-b px-4 text-[13px]',
                isActive
                  ? 'border-[var(--accent-amber)] bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                  : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]/60 hover:text-[var(--text-secondary)]',
              )}
              key={project.id}
              onClick={() => void onSelectProject(project.id)}
              type="button"
            >
              <span className="truncate font-mono">{project.name}</span>
              {project.hasLiveActivity ? (
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-sage)] shadow-[0_0_6px_rgba(122,158,138,0.7)]" />
              ) : null}
              {project.changedFileCount > 0 ? (
                <span className="text-[10px] text-[var(--accent-amber)]">✦</span>
              ) : null}
              <span
                className="ml-0.5 rounded p-0.5 text-[var(--text-muted)] opacity-0 hover:bg-[var(--bg-overlay)] hover:text-[var(--text-secondary)] group-hover:opacity-100"
                onClick={(event) => {
                  event.stopPropagation()
                  void onRemoveProject(project.id)
                }}
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex items-center pr-2">
        <Button onClick={onAddProject} size="icon" variant="ghost">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </header>
  )
}
