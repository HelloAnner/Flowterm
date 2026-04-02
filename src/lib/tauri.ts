import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { openUrl as tauriOpenUrl } from '@tauri-apps/plugin-opener'

import type {
  AppBootstrap,
  AgentStatusEvent,
  FilePreview,
  GitCommitResult,
  GitPullResult,
  GitRepository,
  LlmConfig,
  PerformanceProbeReport,
  PerformanceProbeState,
  ProjectEntryKind,
  ProjectWorkspaceState,
  ProjectRefreshEvent,
  ProjectSnapshot,
  RecentProject,
  TerminalAttachment,
  TerminalOutputEvent,
  TerminalStateEvent,
} from './contracts'

export const FLOWTERM_EVENTS = {
  agentStatus: 'flowterm://agent-status',
  projectRefresh: 'flowterm://project-refresh',
  terminalOutput: 'flowterm://terminal-output',
  terminalState: 'flowterm://terminal-state',
} as const

export function isTauriEnvironment(): boolean {
  return '__TAURI_INTERNALS__' in window
}

export async function openUrl(url: string): Promise<void> {
  if (isTauriEnvironment()) {
    return tauriOpenUrl(url)
  }
  window.open(url, '_blank', 'noopener')
}

export async function bootstrapApp(): Promise<AppBootstrap> {
  return invoke<AppBootstrap>('bootstrap_app')
}

export async function addProject(
  path: string,
  name?: string,
): Promise<AppBootstrap> {
  return invoke<AppBootstrap>('add_project', { path, name })
}

export async function removeProject(projectId: string): Promise<AppBootstrap> {
  return invoke<AppBootstrap>('remove_project', { projectId })
}

export async function listRecentProjects(): Promise<RecentProject[]> {
  return invoke<RecentProject[]>('list_recent_projects')
}

export async function activateProject(
  projectId: string,
): Promise<ProjectSnapshot> {
  return invoke<ProjectSnapshot>('activate_project', { projectId })
}

export async function focusProject(
  projectId: string,
): Promise<void> {
  return invoke('focus_project', { projectId })
}

export async function refreshProjectSnapshot(
  projectId: string,
): Promise<ProjectSnapshot> {
  return invoke<ProjectSnapshot>('refresh_project_snapshot', { projectId })
}

// In-flight deduplication: reuse pending IPC for identical file preview requests
const previewInflight = new Map<string, Promise<FilePreview>>()

export async function readFilePreview(
  projectId: string,
  path: string,
  options?: {
    startLine?: number
    lineCount?: number
  },
): Promise<FilePreview> {
  const key = `${projectId}::${path}::${options?.startLine ?? 0}::${options?.lineCount ?? 0}`
  const pending = previewInflight.get(key)

  if (pending) {
    return pending
  }

  const request = invoke<FilePreview>('read_file_preview', {
    lineCount: options?.lineCount,
    path,
    projectId,
    startLine: options?.startLine,
  }).finally(() => {
    previewInflight.delete(key)
  })

  previewInflight.set(key, request)

  return request
}

export async function writeProjectFile(
  projectId: string,
  path: string,
  content: string,
): Promise<FilePreview> {
  return invoke<FilePreview>('write_project_file', {
    content,
    path,
    projectId,
  })
}

export async function createProjectEntry(
  projectId: string,
  path: string,
  kind: ProjectEntryKind,
): Promise<string> {
  return invoke<string>('create_project_entry', {
    kind,
    path,
    projectId,
  })
}

export async function deleteProjectEntry(
  projectId: string,
  path: string,
): Promise<void> {
  return invoke('delete_project_entry', { path, projectId })
}

export async function attachTerminal(
  projectId: string,
  paneId?: string,
): Promise<TerminalAttachment> {
  return invoke<TerminalAttachment>('attach_terminal', { paneId, projectId })
}

export async function listTerminals(
  projectId: string,
): Promise<TerminalAttachment[]> {
  return invoke<TerminalAttachment[]>('list_terminals', { projectId })
}

export async function readProjectWorkspace(
  projectId: string,
): Promise<ProjectWorkspaceState> {
  return invoke<ProjectWorkspaceState>('read_project_workspace', { projectId })
}

export async function saveProjectWorkspace(
  projectId: string,
  workspaceState: ProjectWorkspaceState,
): Promise<void> {
  return invoke('save_project_workspace', { projectId, workspaceState })
}

export async function writeTerminal(
  sessionId: string,
  data: string,
): Promise<void> {
  return invoke('write_terminal', { sessionId, data })
}

export async function resizeTerminal(
  sessionId: string,
  cols: number,
  rows: number,
): Promise<void> {
  return invoke('resize_terminal', { sessionId, cols, rows })
}

export async function closeTerminal(
  projectId: string,
  sessionId: string,
): Promise<void> {
  return invoke('close_terminal', { projectId, sessionId })
}

export async function readPerformanceProbeState(): Promise<PerformanceProbeState> {
  return invoke<PerformanceProbeState>('read_performance_probe_state')
}

export async function completePerformanceProbe(
  report: PerformanceProbeReport,
  exitCode = 0,
): Promise<void> {
  return invoke('complete_performance_probe', { exitCode, report })
}

// ---------------------------------------------------------------------------
// LLM Configuration
// ---------------------------------------------------------------------------

export async function readLlmConfig(): Promise<LlmConfig> {
  return invoke<LlmConfig>('read_llm_config')
}

export async function saveLlmConfig(config: LlmConfig): Promise<void> {
  return invoke('save_llm_config', { config })
}

// ---------------------------------------------------------------------------
// Git Operations
// ---------------------------------------------------------------------------

export async function gitFetchRepos(
  repoPaths: string[],
): Promise<void> {
  return invoke('git_fetch_repos', { repoPaths })
}

export async function scanGitRepos(
  projectId: string,
): Promise<GitRepository[]> {
  return invoke<GitRepository[]>('scan_git_repos', { projectId })
}

export async function refreshGitRepos(
  projectId: string,
  repoPaths: string[],
): Promise<GitRepository[]> {
  return invoke<GitRepository[]>('refresh_git_repos', { projectId, repoPaths })
}

export async function gitPullAllRepos(
  projectId: string,
): Promise<GitPullResult[]> {
  return invoke<GitPullResult[]>('git_pull_all_repos', { projectId })
}

export async function gitAutoCommitRepo(
  projectId: string,
  repoPath: string,
  message: string,
): Promise<GitCommitResult> {
  return invoke<GitCommitResult>('git_auto_commit_repo', {
    message,
    projectId,
    repoPath,
  })
}

export async function gitResolveConflictsRepo(
  projectId: string,
  repoPath: string,
): Promise<string[]> {
  return invoke<string[]>('git_resolve_conflicts_repo', {
    projectId,
    repoPath,
  })
}

export async function gitAiCommitRepo(
  projectId: string,
  repoPath: string,
): Promise<GitCommitResult> {
  return invoke<GitCommitResult>('git_ai_commit_repo', {
    projectId,
    repoPath,
  })
}

export async function gitPushRepo(
  projectId: string,
  repoPath: string,
): Promise<string> {
  return invoke<string>('git_push_repo', { projectId, repoPath })
}

export async function gitStashSaveRepo(
  projectId: string,
  repoPath: string,
): Promise<string> {
  return invoke<string>('git_stash_save_repo', { projectId, repoPath })
}

export async function gitStashPopRepo(
  projectId: string,
  repoPath: string,
): Promise<string> {
  return invoke<string>('git_stash_pop_repo', { projectId, repoPath })
}

// ---------------------------------------------------------------------------
// Event Listeners
// ---------------------------------------------------------------------------

export async function listenProjectRefresh(
  handler: (event: ProjectRefreshEvent) => void,
): Promise<UnlistenFn> {
  return listen<ProjectRefreshEvent>(FLOWTERM_EVENTS.projectRefresh, (event) => {
    handler(event.payload)
  })
}

export async function listenAgentStatus(
  handler: (event: AgentStatusEvent) => void,
): Promise<UnlistenFn> {
  return listen<AgentStatusEvent>(FLOWTERM_EVENTS.agentStatus, (event) => {
    handler(event.payload)
  })
}

export async function listenTerminalOutput(
  handler: (event: TerminalOutputEvent) => void,
): Promise<UnlistenFn> {
  return listen<TerminalOutputEvent>(FLOWTERM_EVENTS.terminalOutput, (event) => {
    handler(event.payload)
  })
}

export async function listenTerminalState(
  handler: (event: TerminalStateEvent) => void,
): Promise<UnlistenFn> {
  return listen<TerminalStateEvent>(FLOWTERM_EVENTS.terminalState, (event) => {
    handler(event.payload)
  })
}
