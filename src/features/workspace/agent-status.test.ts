import { describe, expect, it } from 'vitest'

import type { AgentStatusSnapshot } from '../../lib/contracts'
import {
  pickLeadingAgentStatus,
  resolveAgentStatusCopy,
} from './agent-status'

describe('agent status banner', () => {
  it('prioritizes attention over running and completed panes', () => {
    const status = pickLeadingAgentStatus([
      createStatus({ agent: 'claude-code', phase: 'completed' }),
      createStatus({ agent: 'claude-code', phase: 'running' }),
      createStatus({ agent: 'claude-code', phase: 'attention' }),
    ])

    expect(status).toMatchObject({
      agent: 'claude-code',
      phase: 'attention',
    })
  })

  it('hides the banner when no pane has an active agent signal', () => {
    expect(
      pickLeadingAgentStatus([
        createStatus({ phase: 'idle' }),
        createStatus({ phase: 'idle' }),
      ]),
    ).toBeNull()
  })

  it('renders warm copy for the completed state', () => {
    expect(
      resolveAgentStatusCopy(createStatus({ agent: 'claude-code', phase: 'completed' })),
    ).toEqual({
      title: 'Claude Code 已完成',
      tone: 'settled',
    })
  })
})

function createStatus(
  overrides: Partial<AgentStatusSnapshot> = {},
): AgentStatusSnapshot {
  return {
    agent: 'unknown',
    phase: 'idle',
    ...overrides,
  }
}
