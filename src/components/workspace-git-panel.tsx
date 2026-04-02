import {
  ArrowDown,
  ArrowUp,
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  GitBranch,
  Loader2,
  Sparkles,
} from 'lucide-react'
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactElement,
} from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'

import type {
  DiffLine,
  FilePreview,
  GitChangedFile,
  GitRepository,
} from '../lib/contracts'
import {
  gitAiCommitRepo,
  gitPullAllRepos,
  gitPushRepo,
  gitFetchRepos,
  gitResolveConflictsRepo,
  gitStashPopRepo,
  gitStashSaveRepo,
  isTauriEnvironment,
  readFilePreview,
  refreshGitRepos,
  scanGitRepos,
} from '../lib/tauri'
import {
  resolvePreviewSyntax,
  resolveSyntaxTheme,
} from '../features/workspace/preview-syntax'
import { useSidebarResize } from '../features/workspace/sidebar-resize'
import { cn } from '../lib/utils'

interface WorkspaceGitPanelProps {
  activeProjectId: string | null
  syntaxThemeId: string
}

// ---------------------------------------------------------------------------
// Debounce helper
// ---------------------------------------------------------------------------
function useDebouncedCallback<Args extends readonly unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number,
): (...args: Args) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn

  return useCallback(
    (...args: Args) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => fnRef.current(...args), delayMs)
    },
    [delayMs],
  )
}

// ---------------------------------------------------------------------------
// Tree data structures
// ---------------------------------------------------------------------------
interface TreeNode {
  name: string
  path: string
  isFolder: boolean
  status?: string
  insertions?: number
  deletions?: number
  children: TreeNode[]
}

function buildChangedFileTree(files: GitChangedFile[]): TreeNode[] {
  const root: TreeNode[] = []

  for (const file of files) {
    const parts = file.path.split('/')
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]
      const isLast = i === parts.length - 1
      const partialPath = parts.slice(0, i + 1).join('/')

      let existing = current.find((n) => n.name === name)

      if (!existing) {
        existing = {
          name,
          path: partialPath,
          isFolder: !isLast,
          status: isLast ? file.status : undefined,
          insertions: isLast ? file.insertions : undefined,
          deletions: isLast ? file.deletions : undefined,
          children: [],
        }
        current.push(existing)
      }

      if (!isLast) {
        current = existing.children
      }
    }
  }

  // Sort: folders first, then alphabetically
  function sortTree(nodes: TreeNode[]): TreeNode[] {
    nodes.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const node of nodes) {
      if (node.children.length > 0) sortTree(node.children)
    }
    return nodes
  }

  // Compact single-child folder chains (like IntelliJ IDEA)
  // e.g. src > main > java > com becomes "src/main/java/com"
  function compactTree(nodes: TreeNode[]): TreeNode[] {
    for (const node of nodes) {
      if (node.isFolder) {
        // Recursively compact children first
        node.children = compactTree(node.children)

        // Merge when folder has exactly one child that is also a folder
        while (
          node.children.length === 1 &&
          node.children[0].isFolder
        ) {
          const child = node.children[0]
          node.name = `${node.name}/${child.name}`
          node.path = child.path
          node.children = child.children
        }
      }
    }
    return nodes
  }

  return compactTree(sortTree(root))
}

function countByStatus(files: GitChangedFile[]): {
  modified: number
  added: number
  deleted: number
} {
  let modified = 0
  let added = 0
  let deleted = 0
  for (const f of files) {
    if (f.status === 'M') modified++
    else if (f.status === 'A' || f.status === '?') added++
    else if (f.status === 'D') deleted++
  }
  return { modified, added, deleted }
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------
export const WorkspaceGitPanel = memo(function WorkspaceGitPanel({
  activeProjectId,
  syntaxThemeId,
}: WorkspaceGitPanelProps): ReactElement {
  const repoSidebar = useSidebarResize({
    storageKey: 'git-repo-sidebar',
    defaultWidth: 200,
    minWidth: 140,
    maxWidth: 360,
  })
  const treeSidebar = useSidebarResize({
    storageKey: 'git-tree-sidebar',
    defaultWidth: 260,
    minWidth: 180,
    maxWidth: 440,
  })

  const [repos, setRepos] = useState<GitRepository[]>([])
  const [activeRepoPath, setActiveRepoPath] = useState<string | null>(null)
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
  const [fileDiff, setFileDiff] = useState<FilePreview | null>(null)
  const [isDiffLoading, setIsDiffLoading] = useState(false)
  const [isPulling, setIsPulling] = useState(false)
  const [isCommitting, setIsCommitting] = useState(false)
  const [isPushing, setIsPushing] = useState(false)
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({})
  const [, startTransition] = useTransition()

  const knownRepoPathsRef = useRef<string[]>([])

  const activeRepo = useMemo(
    () => repos.find((r) => r.path === activeRepoPath) ?? repos[0] ?? null,
    [repos, activeRepoPath],
  )

  // Full scan
  const fullScan = useCallback(async () => {
    if (!activeProjectId || !isTauriEnvironment()) return
    try {
      const result = await scanGitRepos(activeProjectId)
      knownRepoPathsRef.current = result.map((r) => r.path)
      startTransition(() => {
        setRepos(result)
        if (!activeRepoPath && result.length > 0) {
          setActiveRepoPath(result[0].path)
        }
      })
    } catch {
      // silent
    }
  }, [activeProjectId, activeRepoPath])

  // Incremental refresh
  const incrementalRefresh = useCallback(async () => {
    if (!activeProjectId || !isTauriEnvironment()) return
    const paths = knownRepoPathsRef.current
    if (paths.length === 0) return void fullScan()
    try {
      const result = await refreshGitRepos(activeProjectId, paths)
      knownRepoPathsRef.current = result.map((r) => r.path)
      startTransition(() => setRepos(result))
    } catch {
      void fullScan()
    }
  }, [activeProjectId, fullScan])

  const debouncedRefresh = useDebouncedCallback(() => {
    void incrementalRefresh()
  }, 300)

  // Fetch from remotes then refresh — updates ahead/behind counts
  const fetchAndRefresh = useCallback(async () => {
    const paths = knownRepoPathsRef.current
    if (paths.length === 0 || !isTauriEnvironment()) return
    await gitFetchRepos(paths)
    await incrementalRefresh()
  }, [incrementalRefresh])

  // Initial scan
  useEffect(() => {
    knownRepoPathsRef.current = []
    void fullScan()
  }, [fullScan])

  // Fetch from remotes on mount and every 60s to keep ahead/behind fresh
  useEffect(() => {
    if (!activeProjectId || !isTauriEnvironment()) return

    // Delay initial fetch slightly so scan completes first
    const initialTimer = setTimeout(() => { void fetchAndRefresh() }, 2000)
    const interval = setInterval(() => { void fetchAndRefresh() }, 60_000)

    return () => {
      clearTimeout(initialTimer)
      clearInterval(interval)
    }
  }, [activeProjectId, fetchAndRefresh])

  // File watcher refresh
  useEffect(() => {
    function handleProjectRefresh(): void { debouncedRefresh() }
    window.addEventListener('flowterm:project-refresh', handleProjectRefresh)
    return () => window.removeEventListener('flowterm:project-refresh', handleProjectRefresh)
  }, [debouncedRefresh])

  // Fetch diff when file is selected
  useEffect(() => {
    if (!activeProjectId || !selectedFilePath) {
      setFileDiff(null)
      return
    }

    let cancelled = false
    setIsDiffLoading(true)

    readFilePreview(activeProjectId, selectedFilePath)
      .then((preview) => {
        if (!cancelled) {
          setFileDiff(preview)
          setIsDiffLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFileDiff(null)
          setIsDiffLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [activeProjectId, selectedFilePath])

  // Re-fetch diff after operations that change file state
  const refreshDiffAfterOperation = useCallback(async () => {
    await incrementalRefresh()
    if (activeProjectId && selectedFilePath) {
      try {
        const preview = await readFilePreview(activeProjectId, selectedFilePath)
        setFileDiff(preview)
      } catch {
        setFileDiff(null)
      }
    }
  }, [activeProjectId, incrementalRefresh, selectedFilePath])

  // Git operations
  const handlePullAll = useCallback(async () => {
    if (!activeProjectId) return
    setIsPulling(true)
    try {
      await gitPullAllRepos(activeProjectId)
      await refreshDiffAfterOperation()
    } catch {
      // silent
    } finally {
      setIsPulling(false)
    }
  }, [activeProjectId, refreshDiffAfterOperation])

  const handleAiCommit = useCallback(async () => {
    if (!activeProjectId || !activeRepo) return
    setIsCommitting(true)
    try {
      await gitAiCommitRepo(activeProjectId, activeRepo.path)
      await refreshDiffAfterOperation()
    } catch {
      // silent
    } finally {
      setIsCommitting(false)
    }
  }, [activeProjectId, activeRepo, refreshDiffAfterOperation])

  const handlePush = useCallback(async () => {
    if (!activeProjectId || !activeRepo) return
    setIsPushing(true)
    try {
      await gitPushRepo(activeProjectId, activeRepo.path)
      await refreshDiffAfterOperation()
    } catch {
      // silent
    } finally {
      setIsPushing(false)
    }
  }, [activeProjectId, activeRepo, refreshDiffAfterOperation])

  const handleStashSave = useCallback(async () => {
    if (!activeProjectId || !activeRepo) return
    try {
      await gitStashSaveRepo(activeProjectId, activeRepo.path)
      await refreshDiffAfterOperation()
    } catch {
      // silent
    }
  }, [activeProjectId, activeRepo, refreshDiffAfterOperation])

  const handleStashPop = useCallback(async () => {
    if (!activeProjectId || !activeRepo) return
    try {
      await gitStashPopRepo(activeProjectId, activeRepo.path)
      await refreshDiffAfterOperation()
    } catch {
      // silent
    }
  }, [activeProjectId, activeRepo, refreshDiffAfterOperation])

  const handleResolveConflicts = useCallback(async () => {
    if (!activeProjectId || !activeRepo) return
    try {
      await gitResolveConflictsRepo(activeProjectId, activeRepo.path)
      await refreshDiffAfterOperation()
    } catch {
      // silent
    }
  }, [activeProjectId, activeRepo, refreshDiffAfterOperation])

  // Keyboard shortcuts
  useEffect(() => {
    function handleGitShortcut(event: Event): void {
      const action = (event as CustomEvent).detail as string
      switch (action) {
        case 'gitAiCommit': void handleAiCommit(); break
        case 'gitPullAll': void handlePullAll(); break
        case 'gitPush': void handlePush(); break
        case 'gitStash': void handleStashSave(); break
        case 'gitStashPop': void handleStashPop(); break
      }
    }
    window.addEventListener('flowterm:git-shortcut', handleGitShortcut)
    return () => { window.removeEventListener('flowterm:git-shortcut', handleGitShortcut) }
  }, [handleAiCommit, handlePullAll, handlePush, handleStashSave, handleStashPop])

  // Tree toggle
  const handleToggleFolder = useCallback((path: string) => {
    setExpandedPaths((prev) => ({ ...prev, [path]: !prev[path] }))
  }, [])

  const fileTree = useMemo(
    () => (activeRepo ? buildChangedFileTree(activeRepo.changedFiles) : []),
    [activeRepo],
  )

  const changeCounts = useMemo(
    () => (activeRepo ? countByStatus(activeRepo.changedFiles) : { modified: 0, added: 0, deleted: 0 }),
    [activeRepo],
  )

  // Expand all folders by default when repo/tree changes
  useEffect(() => {
    if (!activeRepo) return
    const paths: Record<string, boolean> = {}
    function collectPaths(nodes: TreeNode[]): void {
      for (const node of nodes) {
        if (node.isFolder) {
          paths[node.path] = true
          collectPaths(node.children)
        }
      }
    }
    collectPaths(fileTree)
    setExpandedPaths(paths)
  }, [activeRepo, fileTree])

  // Select first changed file when repo changes
  useEffect(() => {
    if (activeRepo && activeRepo.changedFiles.length > 0) {
      setSelectedFilePath(activeRepo.changedFiles[0].path)
    } else {
      setSelectedFilePath(null)
    }
  }, [activeRepo])

  if (!activeProjectId) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--text-muted)] text-sm">
        请先打开一个项目
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ─── Git Repo Sidebar ─── */}
      <div
        className="git-sidebar flex shrink-0 flex-col bg-[var(--bg-elevated)]"
        style={{ width: repoSidebar.width }}
      >
        <div className="flex h-10 items-center gap-2 border-b border-[var(--border-subtle)] px-3.5">
          <span className="text-[11px] font-semibold tracking-wide text-[var(--text-secondary)]">
            repositories
          </span>
          <span className="flex-1" />
          <span className="rounded-full bg-[var(--bg-overlay)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
            {repos.length}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-1.5">
          {repos.map((repo) => (
            <RepoItem
              isPulling={isPulling && repo.behind > 0}
              key={repo.path}
              isActive={repo.path === (activeRepo?.path ?? null)}
              onClick={() => startTransition(() => setActiveRepoPath(repo.path))}
              repo={repo}
            />
          ))}
          {repos.length === 0 && (
            <div className="flex flex-1 items-center justify-center px-4 text-center text-[11px] text-[var(--text-muted)]">
              未检测到 Git 仓库
            </div>
          )}
        </div>
      </div>

      {/* Repo sidebar resize handle */}
      <div
        className={cn(
          'sidebar-resize-handle',
          repoSidebar.isDragging && 'sidebar-resize-handle--active',
        )}
        onMouseDown={repoSidebar.onResizeStart}
      />

      {/* ─── File Tree Panel ─── */}
      <div
        className="git-tree-panel flex shrink-0 flex-col bg-[var(--bg-base)]"
        style={{ width: treeSidebar.width }}
      >
        {/* Tree header */}
        <div className="flex h-10 items-center gap-2 border-b border-[var(--border-subtle)] px-3.5">
          <span className="text-[11px] font-semibold tracking-wide text-[var(--text-secondary)]">
            changes
          </span>
          <span className="flex-1" />
          <div className="flex items-center gap-2">
            {changeCounts.modified > 0 && (
              <span className="font-mono text-[10px] font-semibold text-[var(--accent-amber)]">
                {changeCounts.modified}M
              </span>
            )}
            {changeCounts.added > 0 && (
              <span className="font-mono text-[10px] font-semibold text-[var(--accent-sage)]">
                {changeCounts.added}A
              </span>
            )}
            {changeCounts.deleted > 0 && (
              <span className="font-mono text-[10px] font-semibold text-[var(--accent-clay)]">
                {changeCounts.deleted}D
              </span>
            )}
          </div>
        </div>

        {/* Tree body */}
        <div className="flex-1 overflow-y-auto py-2">
          {activeRepo ? (
            fileTree.length > 0 ? (
              <GitFileTree
                expandedPaths={expandedPaths}
                nodes={fileTree}
                onSelectFile={setSelectedFilePath}
                onToggleFolder={handleToggleFolder}
                selectedFilePath={selectedFilePath}
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-1 px-4 py-12 text-[var(--text-muted)]">
                <span className="text-[12px]">工作区干净</span>
                <span className="text-[11px]">没有未提交的改动</span>
              </div>
            )
          ) : (
            <div className="flex flex-1 items-center justify-center px-4 text-center text-[11px] text-[var(--text-muted)]">
              从左侧选择一个仓库
            </div>
          )}
        </div>

      </div>

      {/* Tree sidebar resize handle */}
      <div
        className={cn(
          'sidebar-resize-handle',
          treeSidebar.isDragging && 'sidebar-resize-handle--active',
        )}
        onMouseDown={treeSidebar.onResizeStart}
      />

      {/* ─── Diff Panel ─── */}
      <div className="flex min-w-0 flex-1 flex-col bg-[var(--bg-base)]">
        <GitDiffViewer
          activeRepo={activeRepo}
          isCommitting={isCommitting}
          isDiffLoading={isDiffLoading}
          isPulling={isPulling}
          isPushing={isPushing}
          onAiCommit={handleAiCommit}
          onPullAll={handlePullAll}
          onPush={handlePush}
          onResolveConflicts={handleResolveConflicts}
          onStashPop={handleStashPop}
          onStashSave={handleStashSave}
          preview={fileDiff}
          selectedFilePath={selectedFilePath}
          syntaxThemeId={syntaxThemeId}
        />
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// GitFileTree — recursive tree rendering of changed files
// ---------------------------------------------------------------------------
const GitFileTree = memo(function GitFileTree({
  expandedPaths,
  nodes,
  onSelectFile,
  onToggleFolder,
  selectedFilePath,
  depth = 0,
}: {
  expandedPaths: Record<string, boolean>
  nodes: TreeNode[]
  onSelectFile: (path: string) => void
  onToggleFolder: (path: string) => void
  selectedFilePath: string | null
  depth?: number
}): ReactElement {
  return (
    <>
      {nodes.map((node) => (
        <GitTreeNode
          depth={depth}
          expandedPaths={expandedPaths}
          key={node.path}
          node={node}
          onSelectFile={onSelectFile}
          onToggleFolder={onToggleFolder}
          selectedFilePath={selectedFilePath}
        />
      ))}
    </>
  )
})

const GitTreeNode = memo(function GitTreeNode({
  depth,
  expandedPaths,
  node,
  onSelectFile,
  onToggleFolder,
  selectedFilePath,
}: {
  depth: number
  expandedPaths: Record<string, boolean>
  node: TreeNode
  onSelectFile: (path: string) => void
  onToggleFolder: (path: string) => void
  selectedFilePath: string | null
}): ReactElement {
  const isExpanded = expandedPaths[node.path] ?? false
  const isSelected = !node.isFolder && selectedFilePath === node.path

  const statusColor = node.status === 'M'
    ? 'text-[var(--accent-amber)]'
    : node.status === 'A' || node.status === '?'
      ? 'text-[var(--accent-sage)]'
      : node.status === 'D'
        ? 'text-[var(--accent-clay)]'
        : 'text-[var(--text-secondary)]'

  const nameColor = node.isFolder
    ? 'text-[var(--text-secondary)]'
    : statusColor

  return (
    <>
      <button
        className={cn(
          'git-tree-row flex w-full items-center gap-1.5 h-[26px] text-left transition-colors',
          isSelected
            ? 'bg-[var(--interactive-hover)]'
            : 'hover:bg-[var(--interactive-hover)]',
        )}
        onClick={() => {
          if (node.isFolder) {
            onToggleFolder(node.path)
          } else {
            onSelectFile(node.path)
          }
        }}
        style={{ paddingLeft: 12 + depth * 16 }}
        type="button"
      >
        {/* Chevron for folders */}
        {node.isFolder ? (
          isExpanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-[var(--text-muted)]" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-[var(--text-muted)]" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}

        {/* Icon */}
        {node.isFolder ? (
          <Folder className="h-[13px] w-[13px] shrink-0 text-[var(--accent-amber)]" />
        ) : (
          <File className={cn('h-[13px] w-[13px] shrink-0', statusColor)} />
        )}

        {/* Name */}
        <span className={cn('truncate text-[12px] font-medium', nameColor)}>
          {node.name}
        </span>

        {/* Status indicator for files */}
        {!node.isFolder && node.status && (
          <span className={cn('ml-auto mr-3 text-[10px] font-semibold', statusColor)}>
            {node.status === '?' ? 'U' : node.status}
          </span>
        )}
      </button>

      {/* Render children if expanded */}
      {node.isFolder && isExpanded && (
        <GitFileTree
          depth={depth + 1}
          expandedPaths={expandedPaths}
          nodes={node.children}
          onSelectFile={onSelectFile}
          onToggleFolder={onToggleFolder}
          selectedFilePath={selectedFilePath}
        />
      )}
    </>
  )
})

// ---------------------------------------------------------------------------
// GitDiffViewer — shows diff for selected file
// ---------------------------------------------------------------------------
const DIFF_ROW_HEIGHT = 24

const GitDiffViewer = memo(function GitDiffViewer({
  activeRepo,
  isCommitting,
  isDiffLoading,
  isPulling,
  isPushing,
  onAiCommit,
  onPullAll,
  onPush,
  onResolveConflicts,
  onStashPop,
  onStashSave,
  preview,
  selectedFilePath,
  syntaxThemeId,
}: {
  activeRepo: GitRepository | null
  isCommitting: boolean
  isDiffLoading: boolean
  isPulling: boolean
  isPushing: boolean
  onAiCommit: () => void
  onPullAll: () => void
  onPush: () => void
  onResolveConflicts: () => void
  onStashPop: () => void
  onStashSave: () => void
  preview: FilePreview | null
  selectedFilePath: string | null
  syntaxThemeId: string
}): ReactElement {
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified')
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const syntaxTheme = useMemo(() => resolveSyntaxTheme(syntaxThemeId), [syntaxThemeId])
  const syntax = useMemo(
    () => (preview ? resolvePreviewSyntax(preview.path) : null),
    [preview],
  )

  // Compute breadcrumb from path
  const breadcrumb = useMemo(() => {
    if (!selectedFilePath) return { prefix: '', filename: '' }
    const parts = selectedFilePath.split('/')
    const filename = parts.pop() ?? ''
    const prefix = parts.length > 0 ? parts.join(' / ') + ' / ' : ''
    return { prefix, filename }
  }, [selectedFilePath])

  // Stats
  const stats = useMemo(() => {
    if (!preview || preview.mode !== 'diff') return null
    let additions = 0
    let deletions = 0
    for (const line of preview.lines) {
      if (line.kind === 'added') additions++
      else if (line.kind === 'removed') deletions++
    }
    return { additions, deletions }
  }, [preview])

  // Reset scroll on file change
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [selectedFilePath])

  return (
    <>
      {/* Diff header */}
      <div className="flex h-10 shrink-0 items-center gap-2.5 border-b border-[var(--border-subtle)] px-5">
        {selectedFilePath ? (
          <>
            <span className="min-w-0 truncate text-[13px] text-[var(--text-muted)]">{breadcrumb.prefix}</span>
            <span className="shrink-0 text-[13px] font-semibold text-[var(--text-primary)]">{breadcrumb.filename}</span>
          </>
        ) : (
          <span className="text-[13px] text-[var(--text-muted)]">—</span>
        )}

        <span className="flex-1" />

        {/* Git action buttons */}
        {activeRepo && (
          <div className="flex items-center gap-1">
            {activeRepo.conflictCount > 0 && (
              <button className="git-action-btn git-action-btn--warn" onClick={onResolveConflicts} type="button">
                <Sparkles className="h-2.5 w-2.5" />
                <span>Resolve</span>
              </button>
            )}
            <button className="git-action-btn" disabled={isPulling} onClick={onPullAll} type="button">
              <ArrowDown className="h-2.5 w-2.5" />
              <span>Pull</span>
            </button>
            <button className="git-action-btn git-action-btn--primary" disabled={isCommitting} onClick={onAiCommit} type="button">
              {isCommitting ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Sparkles className="h-2.5 w-2.5" />}
              <span>Commit</span>
            </button>
            <button className="git-action-btn" disabled={isPushing} onClick={onPush} type="button">
              <ArrowUp className="h-2.5 w-2.5" />
              <span>Push</span>
            </button>
            <button className="git-action-btn" onClick={onStashSave} type="button">
              <Archive className="h-2.5 w-2.5" />
              <span>Stash</span>
            </button>
            <button className="git-action-btn" onClick={onStashPop} type="button">
              <ArchiveRestore className="h-2.5 w-2.5" />
              <span>Pop</span>
            </button>
          </div>
        )}

        {selectedFilePath && stats && (
          <>
            <span className="font-mono text-[11px] font-semibold text-[var(--accent-sage)]">
              +{stats.additions}
            </span>
            <span className="font-mono text-[11px] font-semibold text-[var(--accent-clay)]">
              -{stats.deletions}
            </span>
          </>
        )}

        {/* View toggle */}
        {selectedFilePath && (
          <div className="flex items-center gap-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-0.5">
            <button
              className={cn(
                'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
                viewMode === 'unified'
                  ? 'bg-[var(--bg-overlay)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
              )}
              onClick={() => setViewMode('unified')}
              type="button"
            >
              Unified
            </button>
            <button
              className={cn(
                'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
                viewMode === 'split'
                  ? 'bg-[var(--bg-overlay)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
              )}
              onClick={() => setViewMode('split')}
              type="button"
            >
              Split
            </button>
          </div>
        )}
      </div>

      {/* Diff body */}
      <div className="flex-1 overflow-auto" ref={scrollRef}>
        {isDiffLoading ? (
          <div className="flex h-full items-center justify-center text-[12px] text-[var(--text-muted)]">
            正在加载 diff...
          </div>
        ) : preview ? (
          preview.mode === 'diff' ? (
            <DiffContent
              lines={preview.lines}
              path={preview.path}
              syntax={syntax}
              syntaxTheme={syntaxTheme}
            />
          ) : preview.mode === 'image' && preview.imageDataUrl ? (
            <div className="flex h-full items-center justify-center p-8">
              <img
                alt={preview.path}
                className="max-h-full max-w-full rounded-lg border border-[var(--border-subtle)] object-contain"
                src={preview.imageDataUrl}
              />
            </div>
          ) : (
            <TextContent
              lines={preview.lines}
              path={preview.path}
              syntax={syntax}
              syntaxTheme={syntaxTheme}
            />
          )
        ) : selectedFilePath ? (
          <div className="flex h-full items-center justify-center text-[12px] text-[var(--text-muted)]">
            无法加载预览
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-[12px] text-[var(--text-muted)]">
            从左侧选择一个文件查看 diff
          </div>
        )}
      </div>
    </>
  )
})

// ---------------------------------------------------------------------------
// DiffContent — renders unified diff lines with gutter
// ---------------------------------------------------------------------------
const DiffContent = memo(function DiffContent({
  lines,
  path,
  syntax,
  syntaxTheme,
}: {
  lines: DiffLine[]
  path: string
  syntax: ReturnType<typeof resolvePreviewSyntax> | null
  syntaxTheme: ReturnType<typeof resolveSyntaxTheme>
}): ReactElement {
  return (
    <div className="font-mono text-[11px] leading-6">
      {lines.map((line, index) => (
        <div
          className={cn(
            'flex h-6',
            line.kind === 'added' && 'bg-[var(--diff-added-bg)]',
            line.kind === 'removed' && 'bg-[var(--diff-removed-bg)]',
          )}
          key={`${path}-${index}`}
        >
          {/* Line number gutter */}
          <div
            className={cn(
              'flex w-8 shrink-0 items-center justify-end pr-3 text-right tabular-nums',
              line.kind === 'hunk'
                ? 'text-transparent'
                : line.kind === 'added'
                  ? 'text-[var(--accent-sage)]'
                  : line.kind === 'removed'
                    ? 'text-[var(--accent-clay)]'
                    : 'text-[var(--text-muted)]',
            )}
          >
            {line.newLineNumber ?? line.oldLineNumber ?? ''}
          </div>

          {/* Spacer */}
          <div className="w-3 shrink-0" />

          {/* Content */}
          {line.kind === 'hunk' ? (
            <pre className="flex-1 overflow-x-auto py-0 text-[var(--accent-glow)] opacity-80">
              {line.content}
            </pre>
          ) : syntax && !syntax.isPlainText ? (
            <SyntaxHighlighter
              CodeTag="span"
              customStyle={diffSyntaxStyle}
              language={syntax.language}
              PreTag="div"
              style={syntaxTheme}
              wrapLongLines
            >
              {line.content.length > 0 ? line.content : ' '}
            </SyntaxHighlighter>
          ) : (
            <pre
              className={cn(
                'flex-1 overflow-x-auto py-0',
                line.kind === 'added'
                  ? 'text-[var(--accent-sage)]'
                  : line.kind === 'removed'
                    ? 'text-[var(--accent-clay)]'
                    : 'text-[var(--text-primary)]',
              )}
            >
              {line.content}
            </pre>
          )}
        </div>
      ))}
    </div>
  )
})

// ---------------------------------------------------------------------------
// TextContent — renders plain text lines (for untracked/new files)
// ---------------------------------------------------------------------------
const TextContent = memo(function TextContent({
  lines,
  path,
  syntax,
  syntaxTheme,
}: {
  lines: DiffLine[]
  path: string
  syntax: ReturnType<typeof resolvePreviewSyntax> | null
  syntaxTheme: ReturnType<typeof resolveSyntaxTheme>
}): ReactElement {
  return (
    <div className="font-mono text-[11px] leading-6">
      {lines.map((line, index) => (
        <div className="flex h-6" key={`${path}-${index}`}>
          <div className="flex w-8 shrink-0 items-center justify-end pr-3 text-right tabular-nums text-[var(--text-muted)]">
            {line.newLineNumber ?? index + 1}
          </div>
          <div className="w-3 shrink-0" />
          {syntax && !syntax.isPlainText ? (
            <SyntaxHighlighter
              CodeTag="span"
              customStyle={diffSyntaxStyle}
              language={syntax.language}
              PreTag="div"
              style={syntaxTheme}
              wrapLongLines
            >
              {line.content.length > 0 ? line.content : ' '}
            </SyntaxHighlighter>
          ) : (
            <pre className="flex-1 overflow-x-auto py-0 text-[var(--text-primary)]">
              {line.content}
            </pre>
          )}
        </div>
      ))}
    </div>
  )
})

const diffSyntaxStyle = {
  background: 'transparent',
  flex: '1',
  margin: 0,
  overflow: 'visible',
  padding: 0,
}

// ---------------------------------------------------------------------------
// RepoItem — sidebar repo card
// ---------------------------------------------------------------------------
const RepoItem = memo(function RepoItem({
  isActive,
  isPulling,
  onClick,
  repo,
}: {
  isActive: boolean
  isPulling: boolean
  onClick: () => void
  repo: GitRepository
}): ReactElement {
  const totalChanges = repo.changedFiles.length
  const statusLabel =
    repo.conflictCount > 0
      ? `${repo.conflictCount} conflicts`
      : totalChanges > 0
        ? `${totalChanges} changes`
        : 'clean'
  const statusColor =
    repo.conflictCount > 0
      ? 'text-[var(--accent-amber)]'
      : totalChanges > 0
        ? 'text-[var(--text-secondary)]'
        : 'text-[var(--accent-sage)]'

  const modifiedCount = repo.changedFiles.filter((f) => f.status === 'M').length
  const addedCount = repo.changedFiles.filter((f) => f.status === 'A' || f.status === '?').length
  const deletedCount = repo.changedFiles.filter((f) => f.status === 'D').length

  return (
    <button
      className={cn(
        'git-repo-item flex w-full flex-col gap-1.5 rounded-md p-2.5 text-left transition-all',
        isActive
          ? 'bg-[var(--bg-overlay)] shadow-[inset_0_0_0_1px_var(--rail-active-border)]'
          : 'hover:bg-[var(--bg-overlay)]',
      )}
      onClick={onClick}
      type="button"
    >
      {isPulling && (
        <div className="git-pull-track h-[2px] -mx-2.5 -mt-1.5 mb-1 overflow-hidden rounded-full bg-[var(--border-subtle)]">
          <div className="git-pull-bar h-full w-1/3 rounded-full bg-[var(--accent-glow)]" />
        </div>
      )}
      <div className="flex items-center gap-2">
        <GitBranch className={cn('h-3.5 w-3.5', isActive ? 'text-[var(--accent-amber)]' : 'text-[var(--text-muted)]')} />
        <span className={cn('text-[13px] font-medium', isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]')}>
          {repo.name}
        </span>
        {repo.conflictCount > 0 && (
          <span className="ml-auto h-2 w-2 rounded-full bg-[var(--accent-amber)]" />
        )}
      </div>
      <div className="flex items-center gap-1.5 pl-5">
        <span className="font-mono text-[11px] text-[var(--accent-glow)]">{repo.branch}</span>
        <span className="text-[11px] text-[var(--text-muted)]">·</span>
        <span className={cn('text-[11px]', statusColor)}>{statusLabel}</span>
        {repo.behind > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--info-badge-bg)] px-1.5 py-px">
            <ArrowDown className="h-2 w-2 text-[var(--accent-glow)]" />
            <span className="font-mono text-[9px] font-semibold text-[var(--accent-glow)]">{repo.behind}</span>
          </span>
        )}
        {repo.ahead > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--info-badge-bg)] px-1.5 py-px">
            <ArrowUp className="h-2 w-2 text-[var(--accent-glow)]" />
            <span className="font-mono text-[9px] font-semibold text-[var(--accent-glow)]">{repo.ahead}</span>
          </span>
        )}
      </div>
      {totalChanges > 0 && (
        <div className="flex items-center gap-1 pl-5">
          {modifiedCount > 0 && <span className="h-1 rounded-full bg-[var(--accent-amber)]" style={{ width: Math.max(8, modifiedCount * 8) }} />}
          {addedCount > 0 && <span className="h-1 rounded-full bg-[var(--accent-sage)]" style={{ width: Math.max(8, addedCount * 8) }} />}
          {deletedCount > 0 && <span className="h-1 rounded-full bg-[var(--accent-clay)]" style={{ width: Math.max(8, deletedCount * 8) }} />}
        </div>
      )}
    </button>
  )
})
