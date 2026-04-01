import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from 'react'
import { Check, Flame, History, Plus, X } from 'lucide-react'

import { Button } from './ui/button'
import { Input } from './ui/input'
import { cn } from '../lib/utils'
import type { ProjectSummary, RecentProject } from '../lib/contracts'

interface WorkspaceTabBarProps {
  activeProjectId: string | null
  onAddProject: () => void
  onOpenRecentProject: (path: string) => void
  onRemoveProject: (projectId: string) => void
  onReorderProjects: (
    draggedProjectId: string,
    targetProjectId: string,
    position?: 'after' | 'before',
  ) => void
  onSelectProject: (projectId: string) => void
  projects: ProjectSummary[]
  recentProjects: RecentProject[]
}

export const WorkspaceTabBar = memo(function WorkspaceTabBar({
  activeProjectId,
  onAddProject,
  onOpenRecentProject,
  onRemoveProject,
  onReorderProjects,
  onSelectProject,
  projects,
  recentProjects,
}: WorkspaceTabBarProps): ReactElement {
  const [isRecentMenuOpen, setIsRecentMenuOpen] = useState(false)
  const [recentProjectQuery, setRecentProjectQuery] = useState('')
  const [highlightedPath, setHighlightedPath] = useState<string | null>(null)
  const [dropIndicator, setDropIndicator] = useState<{
    position: 'after' | 'before'
    projectId: string
  } | null>(null)
  const draggedProjectIdRef = useRef<string | null>(null)
  const recentMenuRef = useRef<HTMLDivElement | null>(null)
  const recentSearchInputRef = useRef<HTMLInputElement | null>(null)
  const activeProjectPath = useMemo(
    () => projects.find((p) => p.id === activeProjectId)?.path ?? null,
    [activeProjectId, projects],
  )
  const filteredProjects = useMemo(() => {
    const normalizedQuery = recentProjectQuery.trim().toLowerCase()

    if (!normalizedQuery) {
      return recentProjects
    }

    return recentProjects.filter((project) =>
      `${project.name} ${project.path}`.toLowerCase().includes(normalizedQuery),
    )
  }, [recentProjectQuery, recentProjects])
  const resolvedHighlightedPath = useMemo(() => {
    if (!isRecentMenuOpen) {
      return highlightedPath
    }

    if (
      highlightedPath &&
      filteredProjects.some((project) => project.path === highlightedPath)
    ) {
      return highlightedPath
    }

    if (activeProjectPath && filteredProjects.some((project) => project.path === activeProjectPath)) {
      return activeProjectPath
    }

    return filteredProjects[0]?.path ?? null
  }, [activeProjectPath, filteredProjects, highlightedPath, isRecentMenuOpen])

  useEffect(() => {
    if (!isRecentMenuOpen) {
      return
    }

    function handlePointerDown(event: PointerEvent): void {
      if (recentMenuRef.current?.contains(event.target as Node)) {
        return
      }

      setIsRecentMenuOpen(false)
    }

    function handleEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setIsRecentMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isRecentMenuOpen])

  useEffect(() => {
    if (!isRecentMenuOpen) {
      return
    }

    window.requestAnimationFrame(() => {
      recentSearchInputRef.current?.focus()
      recentSearchInputRef.current?.select()
    })
  }, [isRecentMenuOpen])

  function selectRecentProject(path: string): void {
    setIsRecentMenuOpen(false)
    setRecentProjectQuery('')
    setHighlightedPath(path)

    const openProject = projects.find((p) => p.path === path)

    if (openProject) {
      void onSelectProject(openProject.id)
    } else {
      void onOpenRecentProject(path)
    }
  }

  function moveHighlight(direction: 'next' | 'previous'): void {
    if (filteredProjects.length === 0) {
      return
    }

    const currentIndex = filteredProjects.findIndex(
      (project) => project.path === resolvedHighlightedPath,
    )
    const baseIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex =
      direction === 'next'
        ? (baseIndex + 1) % filteredProjects.length
        : (baseIndex - 1 + filteredProjects.length) % filteredProjects.length

    setHighlightedPath(filteredProjects[nextIndex]?.path ?? null)
  }

  function handleRecentSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveHighlight('next')
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveHighlight('previous')
      return
    }

    if (event.key === 'Enter' && resolvedHighlightedPath) {
      event.preventDefault()
      selectRecentProject(resolvedHighlightedPath)
    }
  }

  function toggleRecentMenu(): void {
    setIsRecentMenuOpen((currentValue) => {
      const nextValue = !currentValue

      if (nextValue) {
        setRecentProjectQuery('')
        setHighlightedPath(activeProjectPath ?? recentProjects[0]?.path ?? null)
      }

      return nextValue
    })
  }

  return (
    <header className="tab-bar" data-tauri-drag-region>
      <div className="tab-bar__brand">
        <Flame className="h-4 w-4 text-[var(--accent-amber)]" />
      </div>
      <div
        aria-label="项目标签"
        className="tab-bar__tabs"
        role="tablist"
      >
        {projects.map((project) => {
          const isActive = project.id === activeProjectId
          const showsRunningIndicator = project.terminalState === 'running'
          const showsDirtyIndicator = project.changedFileCount > 0

          return (
            <div
              aria-current={isActive ? 'page' : undefined}
              aria-selected={isActive}
              className={cn(
                'tab-bar__tab',
                isActive && 'tab-bar__tab--active',
              )}
              data-state={isActive ? 'active' : 'inactive'}
              data-drop-position={
                dropIndicator?.projectId === project.id ? dropIndicator.position : undefined
              }
              draggable
              key={project.id}
              onDragEnd={() => {
                draggedProjectIdRef.current = null
                setDropIndicator(null)
              }}
              onDragOver={(event) => {
                event.preventDefault()
                if (!draggedProjectIdRef.current || draggedProjectIdRef.current === project.id) {
                  setDropIndicator(null)
                  return
                }

                const bounds = event.currentTarget.getBoundingClientRect()
                const position =
                  event.clientX > bounds.left + bounds.width / 2 ? 'after' : 'before'

                setDropIndicator({
                  position,
                  projectId: project.id,
                })
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setDropIndicator((current) =>
                    current?.projectId === project.id ? null : current,
                  )
                }
              }}
              onDragStart={(event) => {
                draggedProjectIdRef.current = project.id
                event.dataTransfer.effectAllowed = 'move'
              }}
              onDrop={(event) => {
                event.preventDefault()

                if (
                  !draggedProjectIdRef.current ||
                  draggedProjectIdRef.current === project.id
                ) {
                  draggedProjectIdRef.current = null
                  setDropIndicator(null)
                  return
                }

                onReorderProjects(
                  draggedProjectIdRef.current,
                  project.id,
                  dropIndicator?.projectId === project.id ? dropIndicator.position : 'before',
                )
                draggedProjectIdRef.current = null
                setDropIndicator(null)
              }}
              onClick={() => void onSelectProject(project.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  void onSelectProject(project.id)
                }
              }}
              role="tab"
              tabIndex={0}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'tab-bar__drop-indicator',
                  dropIndicator?.projectId === project.id &&
                    dropIndicator.position === 'before'
                    ? 'tab-bar__drop-indicator--before'
                    : '',
                  dropIndicator?.projectId === project.id &&
                    dropIndicator.position === 'after'
                    ? 'tab-bar__drop-indicator--after'
                    : '',
                )}
              />
              <span className="tab-bar__tab-label">{project.name}</span>
              {showsRunningIndicator ? (
                <span
                  aria-label="Agent 运行中"
                  className="tab-bar__indicator tab-bar__indicator--running"
                  role="img"
                />
              ) : null}
              {showsDirtyIndicator ? (
                <span
                  aria-label="未提交改动"
                  className="tab-bar__indicator tab-bar__indicator--dirty"
                  role="img"
                />
              ) : null}
              <button
                aria-label={`关闭 ${project.name}`}
                className={cn(
                  'tab-bar__close',
                  isActive ? 'tab-bar__close--active' : 'tab-bar__close--inactive',
                )}
                onClick={(event) => {
                  event.stopPropagation()
                  void onRemoveProject(project.id)
                }}
                type="button"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )
        })}
      </div>
      <div className="tab-bar__actions" ref={recentMenuRef}>
        <Button
          aria-expanded={isRecentMenuOpen}
          aria-haspopup="menu"
          aria-label="最近项目"
          disabled={recentProjects.length === 0}
          onClick={toggleRecentMenu}
          size="icon"
          variant="ghost"
          className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
        >
          <History className="h-4 w-4" />
        </Button>
        {isRecentMenuOpen ? (
          <div
            aria-label="最近项目列表"
            className="absolute top-full right-0 z-20 mt-2 flex max-h-80 w-80 flex-col overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[var(--surface-shadow)]"
            role="menu"
          >
            <div className="border-b border-[var(--border-subtle)] px-4 py-3">
              <p className="text-[11px] tracking-wide text-[var(--text-muted)] uppercase font-medium">
                最近项目
              </p>
              <Input
                aria-label="搜索最近项目"
                className="mt-3 h-9 bg-[var(--bg-base)] border-[var(--border-subtle)]"
                onChange={(event) => setRecentProjectQuery(event.target.value)}
                onKeyDown={handleRecentSearchKeyDown}
                placeholder="搜索项目名称或路径"
                ref={recentSearchInputRef}
                value={recentProjectQuery}
              />
            </div>
            <div className="flex max-h-64 flex-col overflow-y-auto py-1">
              {filteredProjects.length === 0 ? (
                <div className="px-4 py-6 text-sm text-[var(--text-muted)]">
                  没有匹配的最近项目
                </div>
              ) : filteredProjects.map((project) => {
                const isOpen = projects.some((p) => p.path === project.path)
                const isActive = project.path === activeProjectPath
                const isHighlighted = project.path === resolvedHighlightedPath

                return (
                  <button
                    className={cn(
                      'flex items-start gap-3 px-4 py-3 text-left transition-colors',
                      isHighlighted ? 'bg-[var(--rail-hover-bg)]' : 'hover:bg-[var(--rail-hover-bg)]',
                    )}
                    key={project.path}
                    onClick={() => selectRecentProject(project.path)}
                    onMouseEnter={() => setHighlightedPath(project.path)}
                    role="menuitem"
                    type="button"
                  >
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-[var(--accent-amber)]">
                      {isActive ? <Check className="h-3.5 w-3.5" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                        <span className="truncate">{project.name}</span>
                        {isActive ? (
                          <span className="rounded-full bg-[var(--rail-active-bg)] px-2 py-0.5 text-[10px] tracking-wide text-[var(--text-muted)]">
                            当前
                          </span>
                        ) : isOpen ? (
                          <span className="rounded-full bg-[var(--rail-active-bg)] px-2 py-0.5 text-[10px] tracking-wide text-[var(--text-muted)]">
                            已打开
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block truncate text-xs text-[var(--text-muted)]">
                        {project.path}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
        <Button
          aria-label="添加项目"
          onClick={onAddProject}
          size="icon"
          variant="ghost"
          className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
})
