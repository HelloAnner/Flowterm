export type GitStatusCode = ' ' | 'A' | 'D' | 'M' | '?'

export type LiveStatus = 'added' | 'deleted' | 'idle' | 'modified'

export type TerminalState = 'attention' | 'exited' | 'idle' | 'running'
export type AgentKind = 'aider' | 'claude-code' | 'unknown'
export type AgentPhase = 'attention' | 'completed' | 'idle' | 'running'

export interface AgentStatusSnapshot {
  agent: AgentKind
  phase: AgentPhase
}

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

export interface FilePreview {
  path: string
  mode: 'diff' | 'image' | 'text'
  gitStatus: GitStatusCode
  liveStatus: LiveStatus
  imageDataUrl: string | null
  startLine: number
  totalLines: number
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
  backend: 'xterm'
}

export interface TerminalAttachment {
  agentStatus: AgentStatusSnapshot
  cwd: string | null
  history: string
  paneId: string
  projectId: string
  sessionId: string
  shellLabel: string
  state: TerminalState
}

export interface ProjectWorkspaceState {
  activePaneId: string | null
  isSplitView: boolean
  railWidth: number
  selectedFilePath: string | null
  terminalPaneSizes: number[]
  treeExpandedPaths: Record<string, boolean>
}

export interface AppBootstrap {
  activeProjectId: string | null
  projects: ProjectSummary[]
  snapshot: ProjectSnapshot | null
  terminals: TerminalAttachment[]
  workspaceState: ProjectWorkspaceState | null
}

export interface ProjectRefreshEvent {
  projectId: string
  paths: string[]
}

export interface TerminalOutputEvent {
  chunk: string
  paneId: string
  projectId: string
  sessionId: string
}

export interface TerminalStateEvent {
  paneId: string
  projectId: string
  sessionId: string
  state: TerminalState
}

export interface AgentStatusEvent {
  agent: AgentKind
  paneId: string
  phase: AgentPhase
  projectId: string
  sessionId: string
}

export interface PerformanceProbeState {
  enabled: boolean
  processId: number
  projectRoot: string | null
  processUptimeMs: number
  scenario: string | null
}

export interface PerformanceProbeReport {
  metadata: Record<string, string>
  metrics: Record<string, number>
  scenario: string
}
