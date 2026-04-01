import {
  ArrowDown,
  ArrowUp,
  Archive,
  ArchiveRestore,
  FileCode,
  FilePlus,
  FileX,
  GitBranch,
  GitCommitHorizontal,
  Loader2,
  Sparkles,
} from 'lucide-react'
import {
  memo,
  useCallback,
  useEffect,
  useState,
  type ReactElement,
} from 'react'

import type {
  GitChangedFile,
  GitCommitResult,
  GitConflictFile,
  GitPullResult,
  GitRepository,
} from '../lib/contracts'
import {
  gitAiCommitRepo,
  gitPullAllRepos,
  gitPushRepo,
  gitResolveConflictsRepo,
  gitStashPopRepo,
  gitStashSaveRepo,
  isTauriEnvironment,
  scanGitRepos,
} from '../lib/tauri'
import { cn } from '../lib/utils'

interface WorkspaceGitPanelProps {
  activeProjectId: string | null
}

export const WorkspaceGitPanel = memo(function WorkspaceGitPanel({
  activeProjectId,
}: WorkspaceGitPanelProps): ReactElement {
  const [repos, setRepos] = useState<GitRepository[]>([])
  const [activeRepoPath, setActiveRepoPath] = useState<string | null>(null)
  const [isPulling, setIsPulling] = useState(false)
  const [isCommitting, setIsCommitting] = useState(false)
  const [isPushing, setIsPushing] = useState(false)
  const [pullResults, setPullResults] = useState<GitPullResult[] | null>(null)
  const [commitResult, setCommitResult] = useState<GitCommitResult | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const activeRepo = repos.find((r) => r.path === activeRepoPath) ?? repos[0] ?? null

  const refreshRepos = useCallback(async () => {
    if (!activeProjectId || !isTauriEnvironment()) return
    try {
      const result = await scanGitRepos(activeProjectId)
      setRepos(result)
      if (!activeRepoPath && result.length > 0) {
        setActiveRepoPath(result[0].path)
      }
    } catch {
      // silent
    }
  }, [activeProjectId, activeRepoPath])

  useEffect(() => {
    void refreshRepos()
  }, [refreshRepos])

  const handlePullAll = useCallback(async () => {
    if (!activeProjectId) return
    setIsPulling(true)
    setPullResults(null)
    try {
      const results = await gitPullAllRepos(activeProjectId)
      setPullResults(results)
      await refreshRepos()
    } catch {
      // silent
    } finally {
      setIsPulling(false)
    }
  }, [activeProjectId, refreshRepos])

  const handleAiCommit = useCallback(async () => {
    if (!activeProjectId || !activeRepo) return
    setIsCommitting(true)
    setCommitResult(null)
    setStatusMessage(null)
    try {
      const result = await gitAiCommitRepo(activeProjectId, activeRepo.path)
      setCommitResult(result)
      await refreshRepos()
    } catch (err) {
      setStatusMessage(String(err))
    } finally {
      setIsCommitting(false)
    }
  }, [activeProjectId, activeRepo, refreshRepos])

  const handlePush = useCallback(async () => {
    if (!activeProjectId || !activeRepo) return
    setIsPushing(true)
    setStatusMessage(null)
    try {
      await gitPushRepo(activeProjectId, activeRepo.path)
      setStatusMessage(`${activeRepo.name}: pushed successfully`)
      await refreshRepos()
    } catch (err) {
      setStatusMessage(String(err))
    } finally {
      setIsPushing(false)
    }
  }, [activeProjectId, activeRepo, refreshRepos])

  const handleStashSave = useCallback(async () => {
    if (!activeProjectId || !activeRepo) return
    setStatusMessage(null)
    try {
      await gitStashSaveRepo(activeProjectId, activeRepo.path)
      setStatusMessage(`${activeRepo.name}: stash saved`)
      await refreshRepos()
    } catch (err) {
      setStatusMessage(String(err))
    }
  }, [activeProjectId, activeRepo, refreshRepos])

  const handleStashPop = useCallback(async () => {
    if (!activeProjectId || !activeRepo) return
    setStatusMessage(null)
    try {
      await gitStashPopRepo(activeProjectId, activeRepo.path)
      setStatusMessage(`${activeRepo.name}: stash restored`)
      await refreshRepos()
    } catch (err) {
      setStatusMessage(String(err))
    }
  }, [activeProjectId, activeRepo, refreshRepos])

  const handleResolveConflicts = useCallback(async () => {
    if (!activeProjectId || !activeRepo) return
    try {
      await gitResolveConflictsRepo(activeProjectId, activeRepo.path)
      await refreshRepos()
    } catch {
      // silent
    }
  }, [activeProjectId, activeRepo, refreshRepos])

  // Bind keyboard-dispatched git actions after handlers exist.
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

  if (!activeProjectId) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--text-muted)] text-sm">
        请先打开一个项目
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Git repo sidebar */}
      <div className="git-sidebar flex w-[200px] shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
        <div className="flex h-10 items-center gap-2 border-b border-[var(--border-subtle)] px-3.5">
          <span className="text-[11px] font-semibold tracking-wide text-[var(--text-secondary)]">
            repositories
          </span>
          <span className="ml-auto rounded-full bg-[var(--bg-overlay)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
            {repos.length}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-1.5">
          {repos.map((repo) => (
            <RepoItem
              key={repo.path}
              isActive={repo.path === (activeRepo?.path ?? null)}
              onClick={() => setActiveRepoPath(repo.path)}
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

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col bg-[var(--bg-base)]">
        {/* Toolbar */}
        <div className="flex h-11 items-center gap-2.5 border-b border-[var(--border-subtle)] px-5">
          {activeRepo ? (
            <>
              <span className="text-[15px] font-semibold text-[var(--text-primary)]">
                {activeRepo.name}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-overlay)] px-2.5 py-1">
                <GitBranch className="h-3 w-3 text-[var(--accent-glow)]" />
                <span className="font-mono text-[11px] font-medium text-[var(--accent-glow)]">
                  {activeRepo.branch}
                </span>
              </span>
              {activeRepo.conflictCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--interactive-hover)] px-2.5 py-1">
                  <span className="text-[11px] font-semibold text-[var(--accent-amber)]">
                    {activeRepo.conflictCount} conflicts
                  </span>
                </span>
              )}
            </>
          ) : null}
          <div className="flex-1" />
          {activeRepo?.conflictCount ? (
            <button
              className="git-btn git-btn--primary"
              onClick={handleResolveConflicts}
              type="button"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Auto Resolve
            </button>
          ) : null}
          <button
            className="git-btn"
            disabled={isPulling}
            onClick={handlePullAll}
            type="button"
          >
            <ArrowDown className="h-3.5 w-3.5 text-[var(--accent-glow)]" />
            {isPulling ? 'Pulling...' : 'Pull All'}
          </button>
          <button
            className="git-btn git-btn--primary"
            disabled={isCommitting || !activeRepo}
            onClick={handleAiCommit}
            type="button"
          >
            {isCommitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {isCommitting ? 'AI 生成中...' : 'AI Commit'}
          </button>
          <button
            className="git-btn"
            disabled={isPushing || !activeRepo}
            onClick={handlePush}
            type="button"
          >
            <ArrowUp className="h-3.5 w-3.5 text-[var(--accent-glow)]" />
            {isPushing ? 'Pushing...' : 'Push'}
          </button>
          <button
            className="git-btn"
            disabled={!activeRepo}
            onClick={handleStashSave}
            type="button"
          >
            <Archive className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
            Stash
          </button>
          <button
            className="git-btn"
            disabled={!activeRepo}
            onClick={handleStashPop}
            type="button"
          >
            <ArchiveRestore className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
            Pop
          </button>
        </div>

        {/* Changes body */}
        {activeRepo ? (
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
            {/* Summary row */}
            <ChangeSummary repo={activeRepo} />

            {/* Status message */}
            {statusMessage && (
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-[12px] text-[var(--text-secondary)]">
                {statusMessage}
              </div>
            )}

            {/* Pull results toast */}
            {pullResults && (
              <div className="flex flex-col gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
                {pullResults.map((r) => (
                  <div className="flex items-center gap-2 text-[12px]" key={r.repoName}>
                    <span className={r.success ? 'text-[var(--accent-sage)]' : 'text-[var(--accent-amber)]'}>
                      {r.success ? '✓' : '⚠'}
                    </span>
                    <span className="font-medium text-[var(--text-primary)]">{r.repoName}</span>
                    <span className="text-[var(--text-muted)]">
                      {r.success ? 'pulled' : `${r.conflictCount} conflicts`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Commit result toast */}
            {commitResult && (
              <div className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-[12px]">
                <span className={commitResult.success ? 'text-[var(--accent-sage)]' : 'text-[var(--accent-clay)]'}>
                  {commitResult.success ? '✓' : '✗'}
                </span>
                <span className="font-medium text-[var(--text-primary)]">{commitResult.repoName}</span>
                {commitResult.success && (
                  <span className="font-mono text-[var(--text-muted)]">{commitResult.commitHash}</span>
                )}
                <span className="truncate text-[var(--text-muted)]">{commitResult.message}</span>
              </div>
            )}

            {/* Conflict cards */}
            {activeRepo.conflictFiles.length > 0 && (
              <div className="flex flex-col gap-2.5">
                {activeRepo.conflictFiles.map((file) => (
                  <ConflictCard file={file} key={file.path} />
                ))}
              </div>
            )}

            {/* Changed file cards */}
            <div className="flex flex-col gap-2">
              {activeRepo.changedFiles.map((file) => (
                <FileCard file={file} key={file.path} />
              ))}
              {activeRepo.changedFiles.length === 0 && activeRepo.conflictFiles.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-[var(--text-muted)]">
                  <span className="text-sm">工作区干净</span>
                  <span className="text-xs">没有未提交的改动</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-[13px] text-[var(--text-muted)]">
            从左侧选择一个仓库
          </div>
        )}
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RepoItem({
  isActive,
  onClick,
  repo,
}: {
  isActive: boolean
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
}

function ChangeSummary({ repo }: { repo: GitRepository }): ReactElement {
  const modified = repo.changedFiles.filter((f) => f.status === 'M').length
  const added = repo.changedFiles.filter((f) => f.status === 'A' || f.status === '?').length
  const deleted = repo.changedFiles.filter((f) => f.status === 'D').length
  const conflicts = repo.conflictCount

  return (
    <div className="flex items-center gap-4">
      {conflicts > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-[var(--accent-amber)]" />
          <span className="text-[12px] font-medium text-[var(--accent-amber)]">{conflicts} conflicts</span>
        </span>
      )}
      {modified > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-[var(--accent-amber)]" />
          <span className="text-[12px] font-medium text-[var(--accent-amber)]">{modified} modified</span>
        </span>
      )}
      {added > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-[var(--accent-sage)]" />
          <span className="text-[12px] font-medium text-[var(--accent-sage)]">{added} added</span>
        </span>
      )}
      {deleted > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-[var(--accent-clay)]" />
          <span className="text-[12px] font-medium text-[var(--accent-clay)]">{deleted} deleted</span>
        </span>
      )}
      <div className="flex-1" />
      <span className="text-[12px] text-[var(--text-muted)]">
        {repo.changedFiles.length} files changed
      </span>
    </div>
  )
}

function FileCard({ file }: { file: GitChangedFile }): ReactElement {
  const isModified = file.status === 'M'
  const isAdded = file.status === 'A' || file.status === '?'
  const isDeleted = file.status === 'D'

  const statusLabel = isAdded ? 'added' : isDeleted ? 'deleted' : 'modified'
  const statusColor = isAdded
    ? 'text-[var(--accent-sage)]'
    : isDeleted
      ? 'text-[var(--accent-clay)]'
      : 'text-[var(--accent-amber)]'
  const badgeBg = isAdded
    ? 'bg-[var(--activity-halo)]'
    : isDeleted
      ? 'bg-[var(--error-banner-bg)]'
      : 'bg-[var(--interactive-hover)]'
  const Icon = isAdded ? FilePlus : isDeleted ? FileX : FileCode
  const iconColor = isAdded
    ? 'text-[var(--accent-sage)]'
    : isDeleted
      ? 'text-[var(--accent-clay)]'
      : 'text-[var(--accent-amber)]'

  const statsLabel =
    file.insertions > 0 || file.deletions > 0
      ? `+${file.insertions} −${file.deletions}`
      : ''

  const fileName = file.path.split('/').pop() ?? file.path

  return (
    <div className="git-file-card flex flex-col gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 px-4">
      <div className="flex items-center gap-2.5">
        <Icon className={cn('h-4 w-4 shrink-0', iconColor)} />
        <span className="font-mono text-[13px] font-medium text-[var(--text-primary)]">
          {fileName}
        </span>
        <div className="flex-1" />
        <span className={cn('rounded px-2 py-0.5 text-[10px] font-semibold', badgeBg, statusColor)}>
          {statusLabel}
        </span>
        {statsLabel && (
          <span className="font-mono text-[11px] text-[var(--text-muted)]">{statsLabel}</span>
        )}
      </div>
      <span className="text-[11px] text-[var(--text-muted)]">{file.location}</span>
    </div>
  )
}

function ConflictCard({ file }: { file: GitConflictFile }): ReactElement {
  const fileName = file.path.split('/').pop() ?? file.path

  return (
    <div className="git-conflict-card flex flex-col gap-2.5 rounded-lg border border-[var(--rail-active-border)] bg-[var(--bg-elevated)] p-3.5 px-4">
      <div className="flex items-center gap-2.5">
        <FileCode className="h-4 w-4 shrink-0 text-[var(--accent-amber)]" />
        <span className="font-mono text-[13px] font-medium text-[var(--text-primary)]">
          {fileName}
        </span>
        <div className="flex-1" />
        <span className="rounded bg-[var(--interactive-hover)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-amber)]">
          conflict
        </span>
      </div>
      <span className="text-[11px] text-[var(--text-muted)]">
        {file.path} · both modified
      </span>
      {/* Mini diff preview */}
      <div className="git-conflict-diff flex flex-col gap-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2.5 font-mono text-[11px]">
        <span className="text-[var(--accent-amber)]">{'<<<<<<< HEAD'}</span>
        {file.oursContent.split('\n').filter(Boolean).slice(0, 3).map((line, i) => (
          <span className="text-[var(--accent-sage)]" key={`o${i}`}>  {line}</span>
        ))}
        <span className="text-[var(--text-muted)]">{'======='}</span>
        {file.theirsContent.split('\n').filter(Boolean).slice(0, 3).map((line, i) => (
          <span className="text-[var(--accent-clay)]" key={`t${i}`}>  {line}</span>
        ))}
        <span className="text-[var(--accent-amber)]">{'>>>>>>> theirs'}</span>
      </div>
      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button className="git-resolve-btn" type="button">Accept Ours</button>
        <button className="git-resolve-btn" type="button">Accept Theirs</button>
        <button className="git-resolve-btn git-resolve-btn--ai" type="button">
          <Sparkles className="h-2.5 w-2.5" />
          AI Resolve
        </button>
      </div>
    </div>
  )
}
