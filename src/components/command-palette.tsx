import { type KeyboardEvent, type ReactElement, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, Command, Palette } from 'lucide-react'

import { Input } from './ui/input'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from './ui/dialog'
import { ScrollArea } from './ui/scroll-area'
import { cn } from '../lib/utils'
import { listThemes } from '../features/theme/theme-registry'

interface CommandPaletteProps {
  activeProjectId: string | null
  activeThemeId: string
  files: Array<{
    path: string
  }>
  isOpen: boolean
  onClose: () => void
  onOpenProject: () => void
  onSelectFile: (path: string) => void
  onSelectProject: (projectId: string) => void
  onSelectTheme: (themeId: string) => void
  onSplitTerminal: () => void
  projects: Array<{
    active: boolean
    id: string
    label: string
  }>
}

type PaletteScreen = 'files' | 'projects' | 'root' | 'themes'

interface PaletteItem {
  id: string
  icon: ReactElement
  kind: 'file' | 'files-root' | 'open-project' | 'project' | 'projects-root' | 'split-terminal' | 'theme' | 'themes-root'
  keywords: string[]
  label: string
  rightSlot?: string
}

export function CommandPalette({
  activeProjectId,
  activeThemeId,
  files,
  isOpen,
  onClose,
  onOpenProject,
  onSelectFile,
  onSelectProject,
  onSelectTheme,
  onSplitTerminal,
  projects,
}: CommandPaletteProps): ReactElement {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [query, setQuery] = useState('')
  const [screen, setScreen] = useState<PaletteScreen>('root')
  const [activeIndex, setActiveIndex] = useState(0)
  const rootItems = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = [
      {
        id: 'preferences-color-theme',
        icon: <Palette className="h-4 w-4" />,
        kind: 'themes-root',
        keywords: ['preferences', 'color', 'theme', 'appearance', 'github', 'dark'],
        label: 'Preferences: Color Theme',
        rightSlot: 'recently used',
      },
      {
        id: 'projects-open-project',
        icon: <Command className="h-4 w-4" />,
        kind: 'open-project',
        keywords: ['projects', 'open', 'add', 'folder', 'workspace'],
        label: 'Projects: Open Project',
      },
    ]

    if (projects.length > 0) {
      items.push({
        id: 'projects-switch-project',
        icon: <Command className="h-4 w-4" />,
        kind: 'projects-root',
        keywords: ['projects', 'switch', 'workspace', 'repo'],
        label: 'Projects: Switch Project',
      })
    }

    if (files.length > 0) {
      items.push({
        id: 'files-open-file',
        icon: <Command className="h-4 w-4" />,
        kind: 'files-root',
        keywords: ['files', 'open', 'preview', 'editor'],
        label: 'Files: Open File',
      })
    }

    if (activeProjectId) {
      items.push({
        id: 'terminal-split-terminal',
        icon: <Command className="h-4 w-4" />,
        kind: 'split-terminal',
        keywords: ['terminal', 'split', 'pane', 'shell'],
        label: 'Terminal: Split Terminal',
      })
    }

    return items
  }, [activeProjectId, files.length, projects.length])
  const themeItems = useMemo<PaletteItem[]>(
    () =>
      listThemes().map((theme) => ({
        id: theme.id,
        icon:
          theme.id === activeThemeId
            ? <Check className="h-4 w-4" />
            : <span className="block h-4 w-4" />,
        kind: 'theme',
        keywords: [theme.id, theme.label, 'theme', 'dark'],
        label: theme.label,
      })),
    [activeThemeId],
  )
  const projectItems = useMemo<PaletteItem[]>(
    () =>
      projects.map((project) => ({
        id: project.id,
        icon:
          project.active
            ? <Check className="h-4 w-4" />
            : <span className="block h-4 w-4" />,
        kind: 'project',
        keywords: [project.id, project.label, 'project', 'workspace', 'repo'],
        label: project.label,
        rightSlot: project.active ? 'current' : undefined,
      })),
    [projects],
  )
  const fileItems = useMemo<PaletteItem[]>(
    () =>
      files.map((file) => ({
        id: file.path,
        icon: <span className="block h-4 w-4" />,
        kind: 'file',
        keywords: [file.path, 'file', 'open'],
        label: file.path,
      })),
    [files],
  )
  const visibleItems = useMemo(() => {
    const source =
      screen === 'root'
        ? rootItems
        : screen === 'themes'
          ? themeItems
          : screen === 'projects'
            ? projectItems
            : fileItems
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
      return source
    }

    return source.filter((item) =>
      [item.label, ...item.keywords].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      ),
    )
  }, [fileItems, projectItems, query, rootItems, screen, themeItems])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [isOpen, screen])

  function handleSelect(item: PaletteItem): void {
    if (item.kind === 'themes-root') {
      setScreen('themes')
      setQuery('')
      setActiveIndex(0)
      return
    }
    if (item.kind === 'projects-root') {
      setScreen('projects')
      setQuery('')
      setActiveIndex(0)
      return
    }
    if (item.kind === 'files-root') {
      setScreen('files')
      setQuery('')
      setActiveIndex(0)
      return
    }
    if (item.kind === 'open-project') {
      onOpenProject()
      onClose()
      return
    }
    if (item.kind === 'split-terminal') {
      onSplitTerminal()
      onClose()
      return
    }
    if (item.kind === 'theme') {
      onSelectTheme(item.id)
      onClose()
      return
    }
    if (item.kind === 'project') {
      onSelectProject(item.id)
      onClose()
      return
    }
    if (item.kind === 'file') {
      onSelectFile(item.id)
      onClose()
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) =>
        visibleItems.length === 0 ? 0 : (current + 1) % visibleItems.length,
      )
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) =>
        visibleItems.length === 0
          ? 0
          : (current - 1 + visibleItems.length) % visibleItems.length,
      )
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const item = visibleItems[activeIndex]

      if (item) {
        handleSelect(item)
      }
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()

      if (screen === 'themes') {
        setScreen('root')
        setQuery('')
        setActiveIndex(0)
        return
      }

      onClose()
      return
    }

    if (event.key === 'Backspace' && !query && screen === 'themes') {
      event.preventDefault()
      setScreen('root')
      setActiveIndex(0)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        aria-label="Command Palette"
        className="w-[min(92vw,44rem)] overflow-hidden rounded-xl border-[var(--border-default)] bg-[var(--bg-elevated)] p-0"
      >
        <DialogTitle className="sr-only">Command Palette</DialogTitle>
        <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2">
          {screen === 'themes' ? (
            <button
              aria-label="Back"
              className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]"
              onClick={() => {
                setScreen('root')
                setQuery('')
                setActiveIndex(0)
              }}
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          ) : (
            <Command className="ml-1 h-4 w-4 text-[var(--text-muted)]" />
          )}
          <Input
            aria-controls="command-palette-listbox"
            aria-expanded={isOpen}
            aria-label="Command Palette"
            className="h-9 border-none bg-transparent px-2 text-[15px] shadow-none focus:border-none"
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder={screen === 'root' ? 'Type a command' : 'Select Color Theme'}
            ref={inputRef}
            role="combobox"
            value={query}
          />
        </div>
        {screen === 'themes' ? (
          <div className="border-b border-[var(--border-subtle)] px-4 py-2.5">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Preferences: Color Theme
            </h2>
          </div>
        ) : screen === 'projects' ? (
          <div className="border-b border-[var(--border-subtle)] px-4 py-2.5">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Projects: Switch Project
            </h2>
          </div>
        ) : screen === 'files' ? (
          <div className="border-b border-[var(--border-subtle)] px-4 py-2.5">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Files: Open File
            </h2>
          </div>
        ) : null}
        <ScrollArea className="max-h-[26rem]">
          <div
            aria-label={screen === 'root' ? 'Command results' : 'Theme results'}
            className="py-1.5"
            id="command-palette-listbox"
            role="listbox"
          >
            {visibleItems.length > 0 ? (
              visibleItems.map((item, index) => (
                <button
                  aria-selected={index === activeIndex}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors',
                    index === activeIndex
                      ? 'bg-[var(--sidebar-active-bg)] text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]',
                  )}
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  role="option"
                  type="button"
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--accent-glow)]">
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.rightSlot ? (
                    <span className="shrink-0 text-xs text-[var(--text-muted)]">
                      {item.rightSlot}
                    </span>
                  ) : null}
                </button>
              ))
            ) : (
              <div className="px-4 py-6 text-sm text-[var(--text-muted)]">
                No matching commands
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
