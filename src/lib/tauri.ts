import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

import type {
  AppBootstrap,
  ProjectRefreshEvent,
  ProjectSnapshot,
  TerminalAttachment,
  TerminalOutputEvent,
  TerminalStateEvent,
} from './contracts'

export const FLOWTERM_EVENTS = {
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

export async function attachTerminal(
  projectId: string,
): Promise<TerminalAttachment> {
  return invoke<TerminalAttachment>('attach_terminal', { projectId })
}

export async function writeTerminal(
  projectId: string,
  data: string,
): Promise<void> {
  return invoke('write_terminal', { projectId, data })
}

export async function resizeTerminal(
  projectId: string,
  cols: number,
  rows: number,
): Promise<void> {
  return invoke('resize_terminal', { projectId, cols, rows })
}

export async function listenProjectRefresh(
  handler: (event: ProjectRefreshEvent) => void,
): Promise<UnlistenFn> {
  return listen<ProjectRefreshEvent>(FLOWTERM_EVENTS.projectRefresh, (event) => {
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
