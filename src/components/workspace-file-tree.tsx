import {
  BookOpenText,
  ChevronDown,
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

const ARCHIVE_EXTENSIONS = new Set(['7z', 'bz2', 'gz', 'rar', 'tar', 'tgz', 'xz', 'zip'])
const AUDIO_EXTENSIONS = new Set(['aac', 'flac', 'm4a', 'mp3', 'ogg', 'wav'])
const CODE_EXTENSIONS = new Set([
  'astro',
  'c',
  'cc',
  'cpp',
  'cs',
  'cts',
  'cxx',
  'go',
  'h',
  'hpp',
  'java',
  'js',
  'jsx',
  'kt',
  'kts',
  'mjs',
  'mts',
  'php',
  'py',
  'rb',
  'rs',
  'svelte',
  'swift',
  'ts',
  'tsx',
  'vue',
])
const CONFIG_EXTENSIONS = new Set(['conf', 'config', 'ini', 'toml', 'yaml', 'yml'])
const DATA_EXTENSIONS = new Set(['csv', 'tsv', 'xls', 'xlsx'])
const IMAGE_EXTENSIONS = new Set([
  'avif',
  'bmp',
  'gif',
  'ico',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'webp',
])
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
    if (!contextMenu) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return
      }

      setContextMenu(null)
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null)
      }
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

    if (parentPath) {
      onToggleFolder(parentPath, true)
    }

    setPendingCreate({
      depth: parentPath ? parentPath.split('/').filter(Boolean).length : 0,
      kind,
      parentPath,
      requestId: Date.now(),
    })
  }

  const handleCreateSubmit = async () => {
    if (!pendingCreate || isCreating) {
      return
    }

    const normalizedName = draftName.trim()

    if (!normalizedName) {
      setPendingCreate(null)
      return
    }

    setIsCreating(true)

    try {
      await onCreateEntry(joinTreePath(pendingCreate.parentPath, normalizedName), pendingCreate.kind)
      setDraftName('')
      setPendingCreate(null)
    } catch {
      // Keep the inline input open so the user can correct the name.
    } finally {
      setIsCreating(false)
    }
  }

  const handleTreeContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target

    if (target instanceof HTMLElement && target.closest('[data-tree-row]')) {
      return
    }

    event.preventDefault()
    setContextMenu({
      parentPath: null,
      x: event.clientX,
      y: event.clientY,
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg-elevated)]">
      <div className="flex h-8 items-center justify-between border-b border-[var(--border-subtle)] px-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
          Explorer
        </span>
        <div className="flex items-center gap-1">
          <button
            aria-label="新建文件"
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]"
            onClick={() => startCreate('file', null)}
            type="button"
          >
            <FilePlus2 className="h-3.5 w-3.5" />
          </button>
          <button
            aria-label="新建文件夹"
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]"
            onClick={() => startCreate('folder', null)}
            type="button"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="min-h-full py-1" onContextMenu={handleTreeContextMenu}>
          {rows.map((row) => (
            row.type === 'draft' ? (
              <DraftTreeRow
                depth={row.depth}
                isSubmitting={isCreating}
                key={`draft-${row.parentPath ?? 'root'}-${pendingCreate?.requestId ?? 'new'}`}
                kind={row.kind}
                onCancel={() => {
                  if (!isCreating) {
                    setPendingCreate(null)
                    setDraftName('')
                  }
                }}
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
                  setContextMenu({
                    parentPath: resolveCreateParentPath(node),
                    x: menuEvent.clientX,
                    y: menuEvent.clientY,
                  })
                }}
                onSelectFile={onSelectFile}
                onToggleFolder={onToggleFolder}
              />
            )
          ))}
        </div>
      </ScrollArea>
      {contextMenu ? (
        <div
          className="fixed z-50 min-w-36 rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] p-1 shadow-[var(--surface-shadow)]"
          ref={menuRef}
          role="menu"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
        >
          <ContextMenuItem
            label="New File"
            onClick={() => startCreate('file', contextMenu.parentPath)}
          />
          <ContextMenuItem
            label="New Folder"
            onClick={() => startCreate('folder', contextMenu.parentPath)}
          />
        </div>
      ) : null}
    </div>
  )
})

interface TreeRowProps {
  depth: number
  isExpanded: boolean
  isSelected: boolean
  node: FileTreeNode
  onOpenContextMenu: (
    event: ReactMouseEvent<HTMLButtonElement>,
    node: FileTreeNode,
  ) => void
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
  const statusLabel = resolveStatusLabel(node)

  if (node.kind === 'folder') {
    const FolderIcon = isExpanded ? FolderOpen : Folder

    return (
      <div>
        <button
          data-tree-row=""
          className="flex h-7 w-full items-center gap-1.5 px-1 text-left text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]"
          onClick={() => onToggleFolder(node.path, !isExpanded)}
          onContextMenu={(event) => onOpenContextMenu(event, node)}
          style={{ paddingLeft: `${6 + depth * 12}px` }}
          type="button"
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
          )}
          <FolderIcon className="h-3.5 w-3.5 shrink-0 text-[var(--accent-amber)]" />
          <span className="truncate">{node.name}</span>
          {node.changeCount > 0 ? (
            <span className="ml-auto pr-2 text-[10px] text-[var(--accent-amber)] opacity-70">
              {node.changeCount}
            </span>
          ) : null}
        </button>
      </div>
    )
  }

  const fileColor = resolveFileColor(node.gitStatus, isSelected)
  const { icon: FileIcon, key, toneClassName } = resolveFileVisual(node.path)

  return (
    <button
      data-tree-row=""
      className={cn(
        'relative flex h-7 w-full items-center gap-1.5 px-1 text-left text-[12px] transition-colors',
        isSelected
          ? 'bg-[var(--sidebar-active-bg)] text-[var(--text-primary)]'
          : 'hover:bg-[var(--bg-overlay)]',
        !isSelected && fileColor,
      )}
      onClick={() => onSelectFile(node.path)}
      onContextMenu={(event) => onOpenContextMenu(event, node)}
      style={{ paddingLeft: `${20 + depth * 12}px` }}
      type="button"
    >
      {isSelected ? (
        <span className="absolute left-0 inset-y-1 w-0.5 rounded-full bg-[var(--accent-amber)]" />
      ) : node.hasLiveActivity ? (
        <span className="absolute left-0 inset-y-1.5 w-0.5 bg-[var(--accent-sage)]" />
      ) : null}
      <FileIcon
        className={cn('h-3.5 w-3.5 shrink-0', toneClassName)}
        data-file-icon={key}
      />
      <span className="truncate">{node.name}</span>
      {statusLabel ? (
        <span className="ml-auto pr-2 text-[10px] opacity-50">{statusLabel}</span>
      ) : null}
    </button>
  )
}

const MemoTreeRow = memo(TreeRow)

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

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <div
      className="flex h-7 items-center gap-1.5 px-1 text-[12px]"
      style={{ paddingLeft: `${20 + depth * 12}px` }}
    >
      <Icon
        className={cn(
          'h-3.5 w-3.5 shrink-0',
          kind === 'folder'
            ? 'text-[var(--accent-amber)]'
            : 'text-[var(--text-secondary)]',
        )}
      />
      <input
        className="h-5 min-w-0 flex-1 rounded-sm border border-[var(--accent-amber)] bg-[var(--bg-base)] px-1.5 text-[12px] text-[var(--text-primary)] outline-none"
        disabled={isSubmitting}
        onBlur={() => {
          if (!isSubmitting) {
            onCancel()
          }
        }}
        onChange={(event) => onChangeValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            void onSubmit()
          }

          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
        }}
        placeholder={kind === 'folder' ? 'New Folder' : 'New File'}
        ref={inputRef}
        spellCheck={false}
        value={value}
      />
    </div>
  )
}

function ContextMenuItem({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}): ReactElement {
  return (
    <button
      className="flex w-full items-center rounded px-2 py-1 text-left text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]"
      onClick={onClick}
      role="menuitem"
      type="button"
    >
      {label}
    </button>
  )
}

type VisibleTreeRow =
  | {
      depth: number
      isExpanded: boolean
      node: FileTreeNode
      type: 'node'
    }
  | {
      depth: number
      kind: ProjectEntryKind
      parentPath: string | null
      type: 'draft'
    }

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

    rows.push({
      depth,
      isExpanded,
      node,
      type: 'node',
    })

    if (!isExpanded) {
      return
    }

    if (pendingCreate?.parentPath === node.path) {
      rows.push({
        depth: depth + 1,
        kind: pendingCreate.kind,
        parentPath: pendingCreate.parentPath,
        type: 'draft',
      })
    }

    for (const child of node.children) {
      visit(child, depth + 1)
    }
  }

  if (pendingCreate && !pendingCreate.parentPath) {
    rows.push({
      depth: 0,
      kind: pendingCreate.kind,
      parentPath: null,
      type: 'draft',
    })
  }

  for (const node of nodes) {
    visit(node, 0)
  }

  return rows
}

function joinTreePath(parentPath: string | null, name: string): string {
  const normalizedName = name.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')

  if (!parentPath) {
    return normalizedName
  }

  return `${parentPath}/${normalizedName}`
}

function resolveCreateParentPath(node: FileTreeNode): string | null {
  if (node.kind === 'folder') {
    return node.path
  }

  const lastSlashIndex = node.path.lastIndexOf('/')

  if (lastSlashIndex <= 0) {
    return null
  }

  return node.path.slice(0, lastSlashIndex)
}

function resolveStatusLabel(node: FileTreeNode): string | null {
  if (!node.gitStatus || node.gitStatus === ' ') {
    return null
  }
  return node.gitStatus
}

function resolveFileColor(
  gitStatus: string | null | undefined,
  isSelected: boolean,
): string {
  if (isSelected) {
    return 'text-[var(--text-primary)]'
  }
  if (gitStatus === 'A') {
    return 'text-[var(--accent-sage)] hover:text-[var(--accent-sage)]'
  }
  if (gitStatus === 'D') {
    return 'text-[var(--accent-clay)] hover:text-[var(--accent-clay)]'
  }
  if (gitStatus === 'M') {
    return 'text-[var(--accent-amber)] hover:text-[var(--accent-amber)]'
  }
  if (gitStatus === '?') {
    return 'text-[var(--accent-sage)] opacity-70 hover:opacity-100 hover:text-[var(--accent-sage)]'
  }
  return 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
}

function resolveFileVisual(path: string): {
  icon: LucideIcon
  key: string
  toneClassName: string
} {
  const fileName = path.split('/').pop()?.toLowerCase() ?? path.toLowerCase()
  const extension = fileName.includes('.') ? fileName.split('.').pop() ?? '' : ''

  if (fileName === 'readme' || fileName.startsWith('readme.')) {
    return {
      icon: BookOpenText,
      key: 'markdown',
      toneClassName: 'text-[var(--accent-amber)]',
    }
  }

  if (IMAGE_EXTENSIONS.has(extension)) {
    return {
      icon: Image,
      key: 'image',
      toneClassName: 'text-[var(--accent-glow)]',
    }
  }

  if (JSON_EXTENSIONS.has(extension)) {
    return {
      icon: FileJson2,
      key: 'json',
      toneClassName: 'text-[var(--accent-sage)]',
    }
  }

  if (STYLE_EXTENSIONS.has(extension)) {
    return {
      icon: FileType2,
      key: 'style',
      toneClassName: 'text-[var(--accent-clay)]',
    }
  }

  if (DATA_EXTENSIONS.has(extension)) {
    return {
      icon: FileSpreadsheet,
      key: 'data',
      toneClassName: 'text-[var(--accent-sage)]',
    }
  }

  if (ARCHIVE_EXTENSIONS.has(extension)) {
    return {
      icon: FileArchive,
      key: 'archive',
      toneClassName: 'text-[var(--accent-clay)]',
    }
  }

  if (AUDIO_EXTENSIONS.has(extension)) {
    return {
      icon: FileAudio2,
      key: 'audio',
      toneClassName: 'text-[var(--accent-sage)]',
    }
  }

  if (MEDIA_EXTENSIONS.has(extension)) {
    return {
      icon: FileVideo,
      key: 'video',
      toneClassName: 'text-[var(--accent-glow)]',
    }
  }

  if (
    fileName === '.env' ||
    fileName.startsWith('.env.') ||
    fileName === 'dockerfile' ||
    fileName === 'justfile' ||
    fileName === 'makefile' ||
    CONFIG_EXTENSIONS.has(extension)
  ) {
    return {
      icon: Settings2,
      key: 'config',
      toneClassName: 'text-[var(--text-secondary)]',
    }
  }

  if (extension === 'command' || SHELL_EXTENSIONS.has(extension)) {
    return {
      icon: TerminalSquare,
      key: 'terminal',
      toneClassName: 'text-[var(--accent-amber)]',
    }
  }

  if (fileName === 'license' || TEXT_EXTENSIONS.has(extension)) {
    return extension === 'md' || extension === 'mdx'
      ? {
          icon: BookOpenText,
          key: 'markdown',
          toneClassName: 'text-[var(--accent-amber)]',
        }
      : {
          icon: FileText,
          key: 'text',
          toneClassName: 'text-[var(--text-secondary)]',
        }
  }

  if (CODE_EXTENSIONS.has(extension)) {
    return {
      icon: FileCode2,
      key: 'code',
      toneClassName: 'text-[var(--accent-glow)]',
    }
  }

  return {
    icon: File,
    key: 'file',
    toneClassName: 'text-[var(--text-muted)]',
  }
}
