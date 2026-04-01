import {
  BookOpenText,
  ChevronRight,
  File,
  FileArchive,
  FileAudio2,
  FileCode2,
  FilePlus2,
  FileJson2,
  FileSpreadsheet,
  FileText,
  FileType2,
  FileVideo,
  Folder,
  FolderOpen,
  FolderPlus,
  Image,
  Settings2,
  TerminalSquare,
  type LucideIcon,
} from 'lucide-react'
import {
  memo,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { ScrollArea } from './ui/scroll-area'
import { buildFileTree, type FileTreeNode } from '../features/workspace/tree'
import type { ProjectEntryKind, ProjectFileEntry } from '../lib/contracts'
import { cn } from '../lib/utils'

const INDENT_PX = 16
const ROW_HEIGHT = 26

const ARCHIVE_EXTENSIONS = new Set(['7z', 'bz2', 'gz', 'rar', 'tar', 'tgz', 'xz', 'zip'])
const AUDIO_EXTENSIONS = new Set(['aac', 'flac', 'm4a', 'mp3', 'ogg', 'wav'])
const CODE_EXTENSIONS = new Set([
  'astro', 'c', 'cc', 'cpp', 'cs', 'cts', 'cxx', 'go', 'h', 'hpp',
  'java', 'js', 'jsx', 'kt', 'kts', 'mjs', 'mts', 'php', 'py', 'rb',
  'rs', 'svelte', 'swift', 'ts', 'tsx', 'vue',
])
const CONFIG_EXTENSIONS = new Set(['conf', 'config', 'ini', 'toml', 'yaml', 'yml'])
const DATA_EXTENSIONS = new Set(['csv', 'tsv', 'xls', 'xlsx'])
const IMAGE_EXTENSIONS = new Set(['avif', 'bmp', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'webp'])
const JSON_EXTENSIONS = new Set(['json', 'json5', 'jsonc'])
const MEDIA_EXTENSIONS = new Set(['avi', 'mkv', 'mov', 'mp4', 'webm'])
const SHELL_EXTENSIONS = new Set(['bash', 'fish', 'ps1', 'sh', 'zsh'])
const STYLE_EXTENSIONS = new Set(['css', 'less', 'pcss', 'sass', 'scss', 'styl'])
const TEXT_EXTENSIONS = new Set(['log', 'md', 'mdx', 'rst', 'txt'])

interface WorkspaceFileTreeProps {
  expandedPaths: Record<string, boolean>
  files: ProjectFileEntry[]
  onCreateEntry: (path: string, kind: ProjectEntryKind) => Promise<void>
  onToggleFolder: (path: string, expanded: boolean) => void
  onSelectFile: (path: string) => void
  selectedFilePath: string | null
}

export const WorkspaceFileTree = memo(function WorkspaceFileTree({
  expandedPaths,
  files,
  onCreateEntry,
  onToggleFolder,
  onSelectFile,
  selectedFilePath,
}: WorkspaceFileTreeProps): ReactElement {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [draftName, setDraftName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [pendingCreate, setPendingCreate] = useState<PendingCreateState | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const nodes = useMemo(() => buildFileTree(files), [files])
  const rows = useMemo(
    () => buildVisibleRows(nodes, expandedPaths, pendingCreate),
    [expandedPaths, nodes, pendingCreate],
  )

  useEffect(() => {
    if (!contextMenu) return

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
      setContextMenu(null)
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null)
    }

    window.addEventListener('keydown', handleEscape)
    window.addEventListener('pointerdown', handlePointerDown)

    return () => {
      window.removeEventListener('keydown', handleEscape)
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [contextMenu])

  const startCreate = (kind: ProjectEntryKind, parentPath: string | null) => {
    setContextMenu(null)
    setDraftName('')
    if (parentPath) onToggleFolder(parentPath, true)

    setPendingCreate({
      depth: parentPath ? parentPath.split('/').filter(Boolean).length : 0,
      kind,
      parentPath,
      requestId: Date.now(),
    })
  }

  const handleCreateSubmit = async () => {
    if (!pendingCreate || isCreating) return
    const normalizedName = draftName.trim()
    if (!normalizedName) { setPendingCreate(null); return }

    setIsCreating(true)
    try {
      await onCreateEntry(joinTreePath(pendingCreate.parentPath, normalizedName), pendingCreate.kind)
      setDraftName('')
      setPendingCreate(null)
    } catch {
      // Keep input open
    } finally {
      setIsCreating(false)
    }
  }

  const handleTreeContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target
    if (target instanceof HTMLElement && target.closest('[data-tree-row]')) return

    event.preventDefault()
    setContextMenu({ parentPath: null, x: event.clientX, y: event.clientY })
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg-elevated)]">
      {/* Header */}
      <div className="flex h-8 items-center justify-between border-b border-[var(--border-subtle)] px-3">
        <span className="text-[11px] font-medium tracking-wide text-[var(--text-muted)]">
          Explorer
        </span>
        <div className="flex items-center gap-0.5">
          <button
            aria-label="新建文件"
            className="tree-header-btn"
            onClick={() => startCreate('file', null)}
            type="button"
          >
            <FilePlus2 className="h-3.5 w-3.5" />
          </button>
          <button
            aria-label="新建文件夹"
            className="tree-header-btn"
            onClick={() => startCreate('folder', null)}
            type="button"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Tree body */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="min-h-full py-0.5" onContextMenu={handleTreeContextMenu}>
          {rows.map((row) => (
            row.type === 'draft' ? (
              <DraftTreeRow
                depth={row.depth}
                isSubmitting={isCreating}
                key={`draft-${row.parentPath ?? 'root'}-${pendingCreate?.requestId ?? 'new'}`}
                kind={row.kind}
                onCancel={() => { if (!isCreating) { setPendingCreate(null); setDraftName('') } }}
                onChangeValue={setDraftName}
                onSubmit={handleCreateSubmit}
                value={draftName}
              />
            ) : (
              <MemoTreeRow
                depth={row.depth}
                isExpanded={row.isExpanded}
                isSelected={selectedFilePath === row.node.path}
                key={row.node.path}
                node={row.node}
                onOpenContextMenu={(menuEvent, node) => {
                  menuEvent.preventDefault()
                  setContextMenu({ parentPath: resolveCreateParentPath(node), x: menuEvent.clientX, y: menuEvent.clientY })
                }}
                onSelectFile={onSelectFile}
                onToggleFolder={onToggleFolder}
              />
            )
          ))}
        </div>
      </ScrollArea>

      {/* Context menu */}
      {contextMenu ? (
        <div
          className="tree-context-menu"
          ref={(node) => {
            menuRef.current = node
            if (node) {
              const rect = node.getBoundingClientRect()
              node.style.left = `${Math.max(8, Math.min(contextMenu.x, window.innerWidth - rect.width - 8))}px`
              node.style.top = `${Math.max(8, Math.min(contextMenu.y, window.innerHeight - rect.height - 8))}px`
            }
          }}
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <ContextMenuItem label="New File" onClick={() => startCreate('file', contextMenu.parentPath)} />
          <ContextMenuItem label="New Folder" onClick={() => startCreate('folder', contextMenu.parentPath)} />
        </div>
      ) : null}
    </div>
  )
})

// ---------------------------------------------------------------------------
// Tree row
// ---------------------------------------------------------------------------

interface TreeRowProps {
  depth: number
  isExpanded: boolean
  isSelected: boolean
  node: FileTreeNode
  onOpenContextMenu: (event: ReactMouseEvent<HTMLButtonElement>, node: FileTreeNode) => void
  onSelectFile: (path: string) => void
  onToggleFolder: (path: string, expanded: boolean) => void
}

function TreeRow({
  depth,
  isExpanded,
  isSelected,
  node,
  onOpenContextMenu,
  onSelectFile,
  onToggleFolder,
}: TreeRowProps): ReactElement {
  const indent = 8 + depth * INDENT_PX
  const statusLabel = resolveStatusLabel(node)

  if (node.kind === 'folder') {
    const FolderIcon = isExpanded ? FolderOpen : Folder

    return (
      <button
        data-tree-row=""
        className={cn(
          'tree-row group',
          isExpanded && 'tree-row--expanded',
        )}
        onClick={() => onToggleFolder(node.path, !isExpanded)}
        onContextMenu={(event) => onOpenContextMenu(event, node)}
        style={{ paddingLeft: `${indent}px`, height: `${ROW_HEIGHT}px` }}
        type="button"
      >
        {/* Indent guides */}
        <IndentGuides depth={depth} />

        {/* Chevron — rotates on expand */}
        <ChevronRight
          className={cn(
            'tree-row__chevron',
            isExpanded && 'tree-row__chevron--open',
          )}
        />
        <FolderIcon className="h-4 w-4 shrink-0 text-[var(--accent-amber)]" />
        <span className="tree-row__label">{node.name}</span>
        {node.changeCount > 0 ? (
          <span className="tree-row__badge text-[var(--accent-amber)]">
            {node.changeCount}
          </span>
        ) : null}
      </button>
    )
  }

  const fileColor = resolveFileColor(node.gitStatus, isSelected)
  const { icon: FileIcon, key, toneClassName } = resolveFileVisual(node.path)

  return (
    <button
      data-tree-row=""
      className={cn(
        'tree-row group',
        isSelected && 'tree-row--selected',
        !isSelected && fileColor,
      )}
      onClick={() => onSelectFile(node.path)}
      onContextMenu={(event) => onOpenContextMenu(event, node)}
      style={{ paddingLeft: `${indent + INDENT_PX}px`, height: `${ROW_HEIGHT}px` }}
      type="button"
    >
      {/* Indent guides */}
      <IndentGuides depth={depth + 1} />

      {/* Selection / activity indicator */}
      {isSelected ? (
        <span className="absolute left-0 inset-y-0.5 w-[2px] rounded-full bg-[var(--accent-amber)]" />
      ) : node.hasLiveActivity ? (
        <span className="absolute left-0 inset-y-1 w-[2px] rounded-full bg-[var(--accent-sage)] opacity-60" />
      ) : null}

      <FileIcon
        className={cn('h-4 w-4 shrink-0', toneClassName)}
        data-file-icon={key}
      />
      <span className="tree-row__label">{node.name}</span>
      {statusLabel ? (
        <span className="tree-row__badge opacity-50">{statusLabel}</span>
      ) : null}
    </button>
  )
}

const MemoTreeRow = memo(TreeRow)

// ---------------------------------------------------------------------------
// Indent guides — thin vertical lines for tree depth
// ---------------------------------------------------------------------------

function IndentGuides({ depth }: { depth: number }): ReactElement | null {
  if (depth === 0) return null

  return (
    <>
      {Array.from({ length: depth }, (_, i) => (
        <span
          className="tree-indent-guide"
          key={i}
          style={{ left: `${8 + i * INDENT_PX + 6}px` }}
        />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Draft row (inline create)
// ---------------------------------------------------------------------------

interface PendingCreateState {
  depth: number
  kind: ProjectEntryKind
  parentPath: string | null
  requestId: number
}

interface ContextMenuState {
  parentPath: string | null
  x: number
  y: number
}

function DraftTreeRow({
  depth,
  isSubmitting,
  kind,
  onCancel,
  onChangeValue,
  onSubmit,
  value,
}: {
  depth: number
  isSubmitting: boolean
  kind: ProjectEntryKind
  onCancel: () => void
  onChangeValue: (value: string) => void
  onSubmit: () => void
  value: string
}): ReactElement {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const Icon = kind === 'folder' ? Folder : File
  const indent = 8 + (depth + 1) * INDENT_PX

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <div
      className="tree-row"
      style={{ paddingLeft: `${indent}px`, height: `${ROW_HEIGHT}px` }}
    >
      <Icon
        className={cn(
          'h-4 w-4 shrink-0',
          kind === 'folder' ? 'text-[var(--accent-amber)]' : 'text-[var(--text-secondary)]',
        )}
      />
      <input
        className="h-5 min-w-0 flex-1 rounded border border-[var(--accent-amber)] bg-[var(--bg-base)] px-1.5 text-[13px] text-[var(--text-primary)] outline-none"
        disabled={isSubmitting}
        onBlur={() => { setTimeout(() => { if (!isSubmitting) onCancel() }, 80) }}
        onChange={(event) => onChangeValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); void onSubmit() }
          if (event.key === 'Escape') { event.preventDefault(); onCancel() }
        }}
        placeholder={kind === 'folder' ? 'folder name' : 'file name'}
        ref={inputRef}
        spellCheck={false}
        value={value}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------

function ContextMenuItem({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}): ReactElement {
  return (
    <button
      className="tree-context-menu__item"
      onClick={onClick}
      role="menuitem"
      type="button"
    >
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type VisibleTreeRow =
  | { depth: number; isExpanded: boolean; node: FileTreeNode; type: 'node' }
  | { depth: number; kind: ProjectEntryKind; parentPath: string | null; type: 'draft' }

function buildVisibleRows(
  nodes: FileTreeNode[],
  expandedPaths: Record<string, boolean>,
  pendingCreate: PendingCreateState | null,
): VisibleTreeRow[] {
  const rows: VisibleTreeRow[] = []

  const visit = (node: FileTreeNode, depth: number) => {
    const isExpanded =
      node.kind === 'folder'
        ? (expandedPaths[node.path] ?? false) || pendingCreate?.parentPath === node.path
        : false

    rows.push({ depth, isExpanded, node, type: 'node' })

    if (!isExpanded) return

    if (pendingCreate?.parentPath === node.path) {
      rows.push({ depth: depth + 1, kind: pendingCreate.kind, parentPath: pendingCreate.parentPath, type: 'draft' })
    }

    for (const child of node.children) {
      visit(child, depth + 1)
    }
  }

  if (pendingCreate && !pendingCreate.parentPath) {
    rows.push({ depth: 0, kind: pendingCreate.kind, parentPath: null, type: 'draft' })
  }

  for (const node of nodes) {
    visit(node, 0)
  }

  return rows
}

function joinTreePath(parentPath: string | null, name: string): string {
  const normalizedName = name.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
  return parentPath ? `${parentPath}/${normalizedName}` : normalizedName
}

function resolveCreateParentPath(node: FileTreeNode): string | null {
  if (node.kind === 'folder') return node.path
  const lastSlashIndex = node.path.lastIndexOf('/')
  return lastSlashIndex <= 0 ? null : node.path.slice(0, lastSlashIndex)
}

function resolveStatusLabel(node: FileTreeNode): string | null {
  if (!node.gitStatus || node.gitStatus === ' ') return null
  return node.gitStatus
}

function resolveFileColor(
  gitStatus: string | null | undefined,
  isSelected: boolean,
): string {
  if (isSelected) return ''
  if (gitStatus === 'A') return 'text-[var(--accent-sage)]'
  if (gitStatus === 'D') return 'text-[var(--accent-clay)] opacity-60'
  if (gitStatus === 'M') return 'text-[var(--accent-amber)]'
  if (gitStatus === '?') return 'text-[var(--accent-sage)] opacity-70'
  return 'text-[var(--text-secondary)]'
}

function resolveFileVisual(path: string): {
  icon: LucideIcon
  key: string
  toneClassName: string
} {
  const fileName = path.split('/').pop()?.toLowerCase() ?? path.toLowerCase()
  const extension = fileName.includes('.') ? fileName.split('.').pop() ?? '' : ''

  if (fileName === 'readme' || fileName.startsWith('readme.'))
    return { icon: BookOpenText, key: 'markdown', toneClassName: 'text-[var(--accent-amber)]' }
  if (IMAGE_EXTENSIONS.has(extension))
    return { icon: Image, key: 'image', toneClassName: 'text-[var(--accent-glow)]' }
  if (JSON_EXTENSIONS.has(extension))
    return { icon: FileJson2, key: 'json', toneClassName: 'text-[var(--accent-sage)]' }
  if (STYLE_EXTENSIONS.has(extension))
    return { icon: FileType2, key: 'style', toneClassName: 'text-[var(--accent-clay)]' }
  if (DATA_EXTENSIONS.has(extension))
    return { icon: FileSpreadsheet, key: 'data', toneClassName: 'text-[var(--accent-sage)]' }
  if (ARCHIVE_EXTENSIONS.has(extension))
    return { icon: FileArchive, key: 'archive', toneClassName: 'text-[var(--accent-clay)]' }
  if (AUDIO_EXTENSIONS.has(extension))
    return { icon: FileAudio2, key: 'audio', toneClassName: 'text-[var(--accent-sage)]' }
  if (MEDIA_EXTENSIONS.has(extension))
    return { icon: FileVideo, key: 'video', toneClassName: 'text-[var(--accent-glow)]' }
  if (fileName === '.env' || fileName.startsWith('.env.') || fileName === 'dockerfile' || fileName === 'justfile' || fileName === 'makefile' || CONFIG_EXTENSIONS.has(extension))
    return { icon: Settings2, key: 'config', toneClassName: 'text-[var(--text-secondary)]' }
  if (extension === 'command' || SHELL_EXTENSIONS.has(extension))
    return { icon: TerminalSquare, key: 'terminal', toneClassName: 'text-[var(--accent-amber)]' }
  if (fileName === 'license' || TEXT_EXTENSIONS.has(extension))
    return extension === 'md' || extension === 'mdx'
      ? { icon: BookOpenText, key: 'markdown', toneClassName: 'text-[var(--accent-amber)]' }
      : { icon: FileText, key: 'text', toneClassName: 'text-[var(--text-secondary)]' }
  if (CODE_EXTENSIONS.has(extension))
    return { icon: FileCode2, key: 'code', toneClassName: 'text-[var(--accent-glow)]' }

  return { icon: File, key: 'file', toneClassName: 'text-[var(--text-muted)]' }
}
