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
      <div className="flex items-center gap-1 px-4">
        <span className="h-3 w-3 rounded-full bg-[var(--accent-clay)]" />
        <span className="h-3 w-3 rounded-full bg-[var(--accent-amber)]" />
        <span className="h-3 w-3 rounded-full bg-[var(--accent-sage)]" />
      </div>
      <div className="flex min-w-0 flex-1 items-stretch gap-1">
        {projects.map((project) => {
          const isActive = project.id === activeProjectId

          return (
            <button
              className={cn(
                'group flex h-9 min-w-0 items-center gap-2 border-b-2 px-4 text-[13px] transition-colors',
                isActive
                  ? 'border-[var(--accent-amber)] bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
              )}
              key={project.id}
              onClick={() => void onSelectProject(project.id)}
              type="button"
            >
              <span className="truncate font-mono">{project.name}</span>
              {project.hasLiveActivity ? (
                <span className="h-2 w-2 rounded-full bg-[var(--accent-sage)] shadow-[0_0_8px_rgba(122,158,138,0.65)]" />
              ) : null}
              {project.changedFileCount > 0 ? (
                <span className="text-[10px] text-[var(--accent-amber)]">✦</span>
              ) : null}
              <span
                className="rounded-full p-0.5 text-[var(--text-muted)] opacity-0 transition-opacity hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)] group-hover:opacity-100"
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
      <Button className="mr-2 mt-0.5" onClick={onAddProject} size="icon" variant="ghost">
        <Plus className="h-4 w-4" />
      </Button>
    </header>
  )
}
