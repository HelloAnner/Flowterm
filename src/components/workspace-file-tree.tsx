import { ChevronDown, ChevronRight, FileCode2, FolderOpen } from 'lucide-react'
import {
  type Dispatch,
  type ReactElement,
  type SetStateAction,
  useMemo,
  useState,
} from 'react'

import { ScrollArea } from './ui/scroll-area'
import { buildFileTree, type FileTreeNode } from '../features/workspace/tree'
import type { ProjectFileEntry } from '../lib/contracts'
import { cn } from '../lib/utils'

interface WorkspaceFileTreeProps {
  files: ProjectFileEntry[]
  onSelectFile: (path: string) => void
  selectedFilePath: string | null
}

export function WorkspaceFileTree({
  files,
  onSelectFile,
  selectedFilePath,
}: WorkspaceFileTreeProps): ReactElement {
  const nodes = useMemo(() => buildFileTree(files), [files])
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({})

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
              onSelectFile={onSelectFile}
              selectedFilePath={selectedFilePath}
              setExpandedPaths={setExpandedPaths}
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
  onSelectFile: (path: string) => void
  selectedFilePath: string | null
  setExpandedPaths: Dispatch<SetStateAction<Record<string, boolean>>>
}

function TreeRow({
  expandedPaths,
  node,
  onSelectFile,
  selectedFilePath,
  setExpandedPaths,
}: TreeRowProps): ReactElement {
  const isExpanded = expandedPaths[node.path] ?? true
  const statusLabel = resolveStatusLabel(node)

  if (node.kind === 'folder') {
    return (
      <div>
        <button
          className="flex h-[26px] w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]"
          onClick={() =>
            setExpandedPaths((current) => ({
              ...current,
              [node.path]: !isExpanded,
            }))
          }
          type="button"
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          <FolderOpen className="h-3.5 w-3.5" />
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
                onSelectFile={onSelectFile}
                selectedFilePath={selectedFilePath}
                setExpandedPaths={setExpandedPaths}
              />
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <button
      className={cn(
        'relative flex h-[26px] w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors',
        selectedFilePath === node.path
          ? 'bg-[var(--bg-overlay)] text-[var(--text-primary)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]',
      )}
      onClick={() => onSelectFile(node.path)}
      type="button"
    >
      {node.hasLiveActivity ? (
        <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-[var(--accent-amber)] shadow-[0_0_8px_rgba(200,169,110,0.7)]" />
      ) : null}
      <FileCode2 className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{node.name}</span>
      {statusLabel ? (
        <span className={cn('ml-auto text-[11px]', resolveStatusColor(statusLabel))}>
          {statusLabel}
        </span>
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

function resolveStatusColor(label: string): string {
  if (label === 'A') {
    return 'text-[var(--accent-sage)]'
  }
  if (label === 'D') {
    return 'text-[var(--accent-clay)]'
  }
  if (label === '?') {
    return 'text-[var(--text-muted)]'
  }
  return 'text-[var(--accent-amber)]'
}
