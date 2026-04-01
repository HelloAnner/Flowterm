import { memo, type KeyboardEvent, type ReactElement, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Command, Palette } from 'lucide-react'

import { Input } from './ui/input'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from './ui/dialog'
import { ScrollArea } from './ui/scroll-area'
import type { ProjectEntryKind } from '../lib/contracts'
import { cn } from '../lib/utils'
import { listThemes } from '../features/theme/theme-registry'

interface CommandPaletteProps {
  activeProjectId: string | null
  activeThemeId: string
  currentThemeId?: string
  files: Array<{
    kind?: ProjectEntryKind
    path: string
  }>
  isOpen: boolean
  onClose: () => void
  onOpenProject: () => void
  onPreviewTheme?: (themeId: string) => void
  onResetThemePreview?: (themeId: string) => void
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
  colorScheme?: 'dark' | 'light'
  id: string
  icon: ReactElement
  kind: 'file' | 'files-root' | 'open-project' | 'project' | 'projects-root' | 'split-terminal' | 'theme' | 'themes-root'
  keywords: string[]
  label: string
  rightSlot?: string
}

interface PaletteSection {
  items: Array<{
    index: number
    item: PaletteItem
  }>
  label: string
}

const placeholders: Record<PaletteScreen, string> = {
  root: 'Type a command',
  themes: 'Select Color Theme (Up/Down to preview)',
  projects: 'Select Project',
  files: 'Search files by name',
}

export const CommandPalette = memo(function CommandPalette({
  activeProjectId,
  activeThemeId,
  currentThemeId,
  files,
  isOpen,
  onClose,
  onOpenProject,
  onPreviewTheme,
  onResetThemePreview,
  onSelectFile,
  onSelectProject,
  onSelectTheme,
  onSplitTerminal,
  projects,
}: CommandPaletteProps): ReactElement {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const previewBaselineThemeIdRef = useRef<string | null>(null)
  const lastPreviewThemeIdRef = useRef<string | null>(null)
  const activeItemRef = useRef<HTMLButtonElement | null>(null)
  const [query, setQuery] = useState('')
  const [screen, setScreen] = useState<PaletteScreen>('root')
  const [activeIndex, setActiveIndex] = useState(0)
  const displayedThemeId = currentThemeId ?? activeThemeId
  const rootItems = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = [
      {
        id: 'preferences-color-theme',
        icon: <Palette className="h-3.5 w-3.5" />,
        kind: 'themes-root',
        keywords: ['preferences', 'color', 'theme', 'appearance', 'github', 'dark'],
        label: 'Preferences: Color Theme',
        rightSlot: 'recently used',
      },
      {
        id: 'projects-open-project',
        icon: <Command className="h-3.5 w-3.5" />,
        kind: 'open-project',
        keywords: ['projects', 'open', 'add', 'folder', 'workspace'],
        label: 'Projects: Open Project',
      },
    ]

    if (projects.length > 0) {
      items.push({
        id: 'projects-switch-project',
        icon: <Command className="h-3.5 w-3.5" />,
        kind: 'projects-root',
        keywords: ['projects', 'switch', 'workspace', 'repo'],
        label: 'Projects: Switch Project',
      })
    }

    if (files.length > 0) {
      items.push({
        id: 'files-open-file',
        icon: <Command className="h-3.5 w-3.5" />,
        kind: 'files-root',
        keywords: ['files', 'open', 'preview', 'editor'],
        label: 'Files: Open File',
      })
    }

    if (activeProjectId) {
      items.push({
        id: 'terminal-split-terminal',
        icon: <Command className="h-3.5 w-3.5" />,
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
        colorScheme: theme.colorScheme,
        id: theme.id,
        icon:
          theme.id === displayedThemeId
            ? <Check className="h-3.5 w-3.5" />
            : <span className="block h-3.5 w-3.5" />,
        kind: 'theme',
        keywords: [theme.id, theme.label, 'theme', theme.colorScheme],
        label: theme.label,
      })),
    [displayedThemeId],
  )
  const projectItems = useMemo<PaletteItem[]>(
    () =>
      projects.map((project) => ({
        id: project.id,
        icon:
          project.active
            ? <Check className="h-3.5 w-3.5" />
            : <span className="block h-3.5 w-3.5" />,
        kind: 'project',
        keywords: [project.id, project.label, 'project', 'workspace', 'repo'],
        label: project.label,
        rightSlot: project.active ? 'current' : undefined,
      })),
    [projects],
  )
  const fileItems = useMemo<PaletteItem[]>(
    () =>
      files
        .filter((file) => file.kind !== 'folder')
        .map((file) => ({
          id: file.path,
          icon: <span className="block h-3.5 w-3.5" />,
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
  const themeSections = useMemo<PaletteSection[]>(() => {
    if (screen !== 'themes') {
      return []
    }

    const darkItems = visibleItems
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.kind === 'theme' && item.colorScheme === 'dark')
    const lightItems = visibleItems
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.kind === 'theme' && item.colorScheme === 'light')

    return [
      darkItems.length > 0 ? { label: 'Dark', items: darkItems } : null,
      lightItems.length > 0 ? { label: 'Light', items: lightItems } : null,
    ].filter((section): section is PaletteSection => section !== null)
  }, [screen, visibleItems])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [isOpen, screen])

  useEffect(() => {
    if (typeof activeItemRef.current?.scrollIntoView === 'function') {
      activeItemRef.current.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex])

  useEffect(() => {
    if (screen !== 'themes') {
      lastPreviewThemeIdRef.current = null
      return
    }

    const item = visibleItems[activeIndex]

    if (!item || item.kind !== 'theme' || item.id === lastPreviewThemeIdRef.current) {
      return
    }

    onPreviewTheme?.(item.id)
    lastPreviewThemeIdRef.current = item.id
  }, [activeIndex, onPreviewTheme, screen, visibleItems])

  function resetThemePreview(): void {
    const fallbackThemeId = previewBaselineThemeIdRef.current ?? activeThemeId

    previewBaselineThemeIdRef.current = null
    lastPreviewThemeIdRef.current = null
    onResetThemePreview?.(fallbackThemeId)
  }

  function handleCloseRequest(options?: { preserveThemeSelection?: boolean }): void {
    if (screen === 'themes' && !options?.preserveThemeSelection) {
      resetThemePreview()
    }

    setScreen('root')
    setQuery('')
    setActiveIndex(0)
    onClose()
  }

  function handleSelect(item: PaletteItem): void {
    if (item.kind === 'themes-root') {
      previewBaselineThemeIdRef.current = activeThemeId
      setScreen('themes')
      setQuery('')
      setActiveIndex(
        Math.max(0, themeItems.findIndex((theme) => theme.id === displayedThemeId)),
      )
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
      handleCloseRequest()
      return
    }
    if (item.kind === 'split-terminal') {
      onSplitTerminal()
      handleCloseRequest()
      return
    }
    if (item.kind === 'theme') {
      onSelectTheme(item.id)
      previewBaselineThemeIdRef.current = null
      lastPreviewThemeIdRef.current = null
      handleCloseRequest({ preserveThemeSelection: true })
      return
    }
    if (item.kind === 'project') {
      onSelectProject(item.id)
      handleCloseRequest()
      return
    }
    if (item.kind === 'file') {
      onSelectFile(item.id)
      handleCloseRequest()
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

      if (screen !== 'root') {
        if (screen === 'themes') {
          resetThemePreview()
        }
        setScreen('root')
        setQuery('')
        setActiveIndex(0)
        return
      }

      handleCloseRequest()
      return
    }

    if (event.key === 'Backspace' && !query && screen !== 'root') {
      event.preventDefault()
      if (screen === 'themes') {
        resetThemePreview()
      }
      setScreen('root')
      setQuery('')
      setActiveIndex(0)
    }
  }

  function renderItem(item: PaletteItem, index: number): ReactElement {
    const isActive = index === activeIndex

    return (
      <button
        aria-selected={isActive}
        className={cn(
          'palette-item',
          isActive && 'palette-item--active',
        )}
        key={item.id}
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => handleSelect(item)}
        ref={isActive ? activeItemRef : undefined}
        role="option"
        type="button"
      >
        <span className="palette-item__icon">
          {item.icon}
        </span>
        <span className="palette-item__label">{item.label}</span>
        {item.rightSlot ? (
          <span className="palette-item__hint">
            {item.rightSlot}
          </span>
        ) : null}
      </button>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCloseRequest()}>
      <DialogContent
        aria-describedby={undefined}
        aria-label="Command Palette"
        className="palette-dialog"
        hideCloseButton
        overlayClassName="bg-transparent backdrop-blur-0"
      >
        <DialogTitle className="sr-only">Command Palette</DialogTitle>
        <div className="palette-input-row">
          <Input
            aria-controls="command-palette-listbox"
            aria-expanded={isOpen}
            aria-label="Command Palette"
            className="palette-input"
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholders[screen]}
            ref={inputRef}
            role="combobox"
            value={query}
          />
        </div>
        {screen !== 'root' && (
          <div className="palette-context-bar">
            <span className="palette-context-bar__label">
              {screen === 'themes'
                ? 'Preferences: Color Theme'
                : screen === 'projects'
                  ? 'Projects: Switch Project'
                  : 'Files: Open File'}
            </span>
          </div>
        )}
        <ScrollArea className="palette-list-scroll">
          <div
            aria-label={screen === 'root' ? 'Command results' : 'Theme results'}
            className="palette-list"
            id="command-palette-listbox"
            role="listbox"
          >
            {visibleItems.length > 0 ? (
              screen === 'themes' ? (
                themeSections.map((section) => (
                  <div className="palette-section" key={section.label}>
                    <div className="palette-section__label">
                      {section.label}
                    </div>
                    {section.items.map(({ item, index }) => renderItem(item, index))}
                  </div>
                ))
              ) : (
                visibleItems.map((item, index) => renderItem(item, index))
              )
            ) : (
              <div className="palette-empty">
                No matching commands
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
})
