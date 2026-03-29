export type GitStatusCode = ' ' | 'A' | 'D' | 'M' | '?'

export type LiveStatus = 'added' | 'deleted' | 'idle' | 'modified'

export type TerminalState = 'attention' | 'idle' | 'running'

export interface ProjectFileEntry {
  path: string
  kind: 'file'
  gitStatus: GitStatusCode
  liveStatus: LiveStatus
}

export interface DiffLine {
  kind: 'added' | 'context' | 'hunk' | 'removed'
  content: string
  oldLineNumber: number | null
  newLineNumber: number | null
}

export interface FileDiff {
  path: string
  changeType: 'added' | 'deleted' | 'modified' | 'untracked'
  lines: DiffLine[]
}

export interface ProjectSummary {
  id: string
  name: string
  path: string
  changedFileCount: number
  untrackedFileCount: number
  hasLiveActivity: boolean
  terminalState: TerminalState
}

export interface ProjectSnapshot {
  project: ProjectSummary
  files: ProjectFileEntry[]
  liveDiffs: FileDiff[]
  gitDiffs: FileDiff[]
  backend: 'xterm'
}

export interface TerminalAttachment {
  history: string
  projectId: string
  shellLabel: string
  state: TerminalState
}

export interface AppBootstrap {
  activeProjectId: string | null
  projects: ProjectSummary[]
  snapshot: ProjectSnapshot | null
  terminal: TerminalAttachment | null
}

export interface ProjectRefreshEvent {
  projectId: string
}

export interface TerminalOutputEvent {
  chunk: string
  projectId: string
}

export interface TerminalStateEvent {
  projectId: string
  state: TerminalState
}
