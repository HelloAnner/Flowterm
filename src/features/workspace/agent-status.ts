import type { AgentStatusSnapshot } from '../../lib/contracts'

interface AgentStatusCopy {
  title: string
  tone: 'attention' | 'active' | 'settled'
}

const PRIORITY: Record<AgentStatusSnapshot['phase'], number> = {
  attention: 3,
  completed: 1,
  idle: 0,
  running: 2,
}

export function pickLeadingAgentStatus(
  statuses: AgentStatusSnapshot[],
): AgentStatusSnapshot | null {
  return statuses.reduce<AgentStatusSnapshot | null>((selected, candidate) => {
    if (candidate.phase === 'idle') {
      return selected
    }

    if (!selected) {
      return candidate
    }

    return PRIORITY[candidate.phase] > PRIORITY[selected.phase] ? candidate : selected
  }, null)
}

export function resolveAgentStatusCopy(
  status: AgentStatusSnapshot,
): AgentStatusCopy {
  const agentLabel = resolveAgentLabel(status.agent)

  if (status.phase === 'attention') {
    return {
      title: `${agentLabel} 等待中`,
      tone: 'attention',
    }
  }

  if (status.phase === 'completed') {
    return {
      title: `${agentLabel} 已完成`,
      tone: 'settled',
    }
  }

  return {
    title: `${agentLabel} 运行中`,
    tone: 'active',
  }
}

function resolveAgentLabel(agent: AgentStatusSnapshot['agent']): string {
  if (agent === 'aider') {
    return 'aider'
  }

  if (agent === 'claude-code') {
    return 'Claude Code'
  }

  return 'Agent'
}
