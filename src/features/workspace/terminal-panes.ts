import type {
  AgentStatusEvent,
  AgentStatusSnapshot,
  TerminalAttachment,
  TerminalState,
  TerminalStateEvent,
} from '../../lib/contracts'
import type { TerminalPaneDescriptor } from '../../components/workspace-terminal'

export interface TerminalPaneState {
  agentStatus: AgentStatusSnapshot
  cwd: string | null
  history: string
  paneId: string
  projectId: string
  sessionId: string
  shellLabel: string
  state: TerminalState
}

export interface TerminalProjectState {
  paneOrder: string[]
  panesById: Record<string, TerminalPaneState>
}

export function createTerminalProjectState(): TerminalProjectState {
  return {
    paneOrder: [],
    panesById: {},
  }
}

export function applyTerminalAttachment(
  state: TerminalProjectState,
  attachment: TerminalAttachment,
): TerminalProjectState {
  const pane = state.panesById[attachment.paneId]

  return {
    paneOrder: pane ? state.paneOrder : [...state.paneOrder, attachment.paneId],
    panesById: {
      ...state.panesById,
      [attachment.paneId]: {
        agentStatus: attachment.agentStatus,
        cwd: attachment.cwd,
        history: attachment.history,
        paneId: attachment.paneId,
        projectId: attachment.projectId,
        sessionId: attachment.sessionId,
        shellLabel: attachment.shellLabel,
        state: attachment.state,
      },
    },
  }
}

export function updateAgentStatus(
  state: TerminalProjectState,
  event: AgentStatusEvent,
): TerminalProjectState {
  const pane = state.panesById[event.paneId]

  if (
    !pane ||
    pane.sessionId !== event.sessionId ||
    (pane.agentStatus.agent === event.agent && pane.agentStatus.phase === event.phase)
  ) {
    return state
  }

  return {
    ...state,
    panesById: {
      ...state.panesById,
      [event.paneId]: {
        ...pane,
        agentStatus: {
          agent: event.agent,
          phase: event.phase,
        },
      },
    },
  }
}

export function updateTerminalState(
  state: TerminalProjectState,
  event: TerminalStateEvent,
): TerminalProjectState {
  const pane = state.panesById[event.paneId]

  if (!pane || pane.sessionId !== event.sessionId || pane.state === event.state) {
    return state
  }

  return {
    ...state,
    panesById: {
      ...state.panesById,
      [event.paneId]: {
        ...pane,
        state: event.state,
      },
    },
  }
}

export function removeTerminalPane(
  state: TerminalProjectState,
  paneId: string,
): TerminalProjectState {
  if (!(paneId in state.panesById)) {
    return state
  }

  const panesById = { ...state.panesById }
  delete panesById[paneId]

  return {
    paneOrder: state.paneOrder.filter((currentPaneId) => currentPaneId !== paneId),
    panesById,
  }
}

export function buildTerminalPaneDescriptors(
  state: TerminalProjectState,
): TerminalPaneDescriptor[] {
  return state.paneOrder
    .map((paneId) => state.panesById[paneId])
    .filter((pane): pane is TerminalPaneState => Boolean(pane))
    .map((pane) => ({
      agentStatus: pane.agentStatus,
      cwd: pane.cwd,
      history: pane.history,
      id: pane.paneId,
      projectId: pane.projectId,
      sessionId: pane.sessionId,
      shellLabel: pane.shellLabel,
      state: pane.state,
    }))
}

export function aggregateTerminalState(
  state: TerminalProjectState,
): TerminalState {
  let aggregateState: TerminalState = 'idle'

  for (const paneId of state.paneOrder) {
    const pane = state.panesById[paneId]

    if (!pane) {
      continue
    }

    if (pane.state === 'attention') {
      return 'attention'
    }

    if (pane.state === 'running') {
      aggregateState = 'running'
    }
  }

  return aggregateState
}
