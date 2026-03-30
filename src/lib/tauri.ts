import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

import type {
  AppBootstrap,
  AgentStatusEvent,
  FilePreview,
  PerformanceProbeReport,
  PerformanceProbeState,
  ProjectWorkspaceState,
  ProjectRefreshEvent,
  ProjectSnapshot,
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

export async function activateProject(
  projectId: string,
): Promise<ProjectSnapshot> {
  return invoke<ProjectSnapshot>('activate_project', { projectId })
}

export async function refreshProjectSnapshot(
  projectId: string,
): Promise<ProjectSnapshot> {
  return invoke<ProjectSnapshot>('refresh_project_snapshot', { projectId })
}

export async function readFilePreview(
  projectId: string,
  path: string,
  options?: {
    startLine?: number
    lineCount?: number
  },
): Promise<FilePreview> {
  return invoke<FilePreview>('read_file_preview', {
    lineCount: options?.lineCount,
    path,
    projectId,
    startLine: options?.startLine,
  })
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
