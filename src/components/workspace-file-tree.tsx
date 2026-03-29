import {
  BookOpenText,
  ChevronDown,
  ChevronRight,
  File,
  FileArchive,
  FileAudio2,
  FileCode2,
  FileJson2,
  FileSpreadsheet,
  FileText,
  FileType2,
  FileVideo,
  Folder,
  FolderOpen,
  Image,
  Settings2,
  TerminalSquare,
  type LucideIcon,
} from 'lucide-react'
import { type ReactElement, useMemo } from 'react'

import { ScrollArea } from './ui/scroll-area'
import { buildFileTree, type FileTreeNode } from '../features/workspace/tree'
import type { ProjectFileEntry } from '../lib/contracts'
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
  onExpandedPathsChange: (expandedPaths: Record<string, boolean>) => void
  onSelectFile: (path: string) => void
  selectedFilePath: string | null
}

export function WorkspaceFileTree({
  expandedPaths,
  files,
  onExpandedPathsChange,
  onSelectFile,
  selectedFilePath,
}: WorkspaceFileTreeProps): ReactElement {
  const nodes = useMemo(() => buildFileTree(files), [files])

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg-elevated)]">
      <div className="flex h-9 items-center border-b border-[var(--border-subtle)] px-4">
        <span className="text-[13px] font-medium text-[var(--text-secondary)]">
          项目文件
        </span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-2 py-2">
          {nodes.map((node) => (
            <TreeRow
              expandedPaths={expandedPaths}
              key={node.path}
              node={node}
              onExpandedPathsChange={onExpandedPathsChange}
              onSelectFile={onSelectFile}
              selectedFilePath={selectedFilePath}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

interface TreeRowProps {
  expandedPaths: Record<string, boolean>
  node: FileTreeNode
  onExpandedPathsChange: (expandedPaths: Record<string, boolean>) => void
  onSelectFile: (path: string) => void
  selectedFilePath: string | null
}

function TreeRow({
  expandedPaths,
  node,
  onExpandedPathsChange,
  onSelectFile,
  selectedFilePath,
}: TreeRowProps): ReactElement {
  const isExpanded = expandedPaths[node.path] ?? true
  const statusLabel = resolveStatusLabel(node)

  if (node.kind === 'folder') {
    const FolderIcon = isExpanded ? FolderOpen : Folder

    return (
      <div>
        <button
          className="flex h-[26px] w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]"
          onClick={() =>
            onExpandedPathsChange({
              ...expandedPaths,
              [node.path]: !isExpanded,
            })
          }
          type="button"
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          <FolderIcon className="h-3.5 w-3.5 text-[var(--accent-amber)]" />
          <span className="truncate">{node.name}</span>
          {node.changeCount > 0 ? (
            <span className="ml-auto text-[11px] text-[var(--accent-amber)]">
              {node.changeCount}
            </span>
          ) : null}
        </button>
        {isExpanded ? (
          <div className="ml-3 border-l border-[var(--border-subtle)] pl-2">
            {node.children.map((child) => (
              <TreeRow
                expandedPaths={expandedPaths}
                key={child.path}
                node={child}
                onExpandedPathsChange={onExpandedPathsChange}
                onSelectFile={onSelectFile}
                selectedFilePath={selectedFilePath}
              />
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  const isSelected = selectedFilePath === node.path
  const fileColor = resolveFileColor(node.gitStatus, isSelected)
  const { icon: FileIcon, key, toneClassName } = resolveFileVisual(node.path)

  return (
    <button
      className={cn(
        'relative flex h-[26px] w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors',
        isSelected ? 'bg-[var(--bg-overlay)]' : 'hover:bg-[var(--bg-overlay)]',
        fileColor,
      )}
      onClick={() => onSelectFile(node.path)}
      type="button"
    >
      {node.hasLiveActivity ? (
        <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-[var(--accent-amber)] shadow-[0_0_8px_rgba(200,169,110,0.7)]" />
      ) : null}
      <FileIcon
        className={cn('h-3.5 w-3.5 shrink-0', toneClassName)}
        data-file-icon={key}
      />
      <span className="truncate">{node.name}</span>
      {statusLabel ? (
        <span className="ml-auto text-[11px] opacity-50">{statusLabel}</span>
      ) : null}
    </button>
  )
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
