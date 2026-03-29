import { describe, expect, it } from 'vitest'

import type { TerminalAttachment, TerminalStateEvent } from '../../lib/contracts'
import {
  applyTerminalAttachment,
  buildTerminalPaneDescriptors,
  removeTerminalPane,
  type TerminalProjectState,
  updateTerminalState,
} from './terminal-panes'

const primaryAttachment: TerminalAttachment = {
  cwd: '/Users/anner/Flowterm',
  history: '$ pwd\n/Users/anner/Flowterm\n',
  paneId: 'pane-main',
  projectId: 'project-a',
  sessionId: 'session-main',
  shellLabel: 'zsh',
  state: 'idle',
}

const splitAttachment: TerminalAttachment = {
  cwd: '/Users/anner/Flowterm/src',
  history: '$ git status --short\n M src/App.tsx\n',
  paneId: 'pane-split',
  projectId: 'project-a',
  sessionId: 'session-split',
  shellLabel: 'zsh',
  state: 'running',
}

describe('terminal pane state', () => {
  it('keeps attachments from different panes isolated inside the same project', () => {
    const state = applyTerminalAttachment(
      applyTerminalAttachment(createProjectState(), primaryAttachment),
      splitAttachment,
    )

    expect(state.paneOrder).toEqual(['pane-main', 'pane-split'])
    expect(state.panesById['pane-main']).toMatchObject({
      cwd: '/Users/anner/Flowterm',
      history: '$ pwd\n/Users/anner/Flowterm\n',
      sessionId: 'session-main',
      state: 'idle',
    })
    expect(state.panesById['pane-split']).toMatchObject({
      cwd: '/Users/anner/Flowterm/src',
      history: '$ git status --short\n M src/App.tsx\n',
      sessionId: 'session-split',
      state: 'running',
    })
  })

  it('applies state changes only to the matching pane', () => {
    const stateEvent: TerminalStateEvent = {
      paneId: 'pane-split',
      projectId: 'project-a',
      sessionId: 'session-split',
      state: 'attention',
    }

    const state = updateTerminalState(
      applyTerminalAttachment(
        applyTerminalAttachment(createProjectState(), primaryAttachment),
        splitAttachment,
      ),
      stateEvent,
    )

    expect(state.panesById['pane-main']).toMatchObject({
      cwd: '/Users/anner/Flowterm',
      history: '$ pwd\n/Users/anner/Flowterm\n',
      state: 'idle',
    })
    expect(state.panesById['pane-split']).toMatchObject({
      cwd: '/Users/anner/Flowterm/src',
      history: '$ git status --short\n M src/App.tsx\n',
      state: 'attention',
    })
  })

  it('builds terminal descriptors in pane order and preserves independent histories', () => {
    const state = applyTerminalAttachment(
      applyTerminalAttachment(createProjectState(), primaryAttachment),
      splitAttachment,
    )

    expect(buildTerminalPaneDescriptors(state)).toEqual([
      {
        cwd: '/Users/anner/Flowterm',
        history: '$ pwd\n/Users/anner/Flowterm\n',
        id: 'pane-main',
        projectId: 'project-a',
        sessionId: 'session-main',
        shellLabel: 'zsh',
        state: 'idle',
      },
      {
        cwd: '/Users/anner/Flowterm/src',
        history: '$ git status --short\n M src/App.tsx\n',
        id: 'pane-split',
        projectId: 'project-a',
        sessionId: 'session-split',
        shellLabel: 'zsh',
        state: 'running',
      },
    ])
  })

  it('removes only the requested pane and keeps the remaining session intact', () => {
    const state = removeTerminalPane(
      applyTerminalAttachment(
        applyTerminalAttachment(createProjectState(), primaryAttachment),
        splitAttachment,
      ),
      'pane-main',
    )

    expect(state.paneOrder).toEqual(['pane-split'])
    expect(state.panesById).toEqual({
      'pane-split': expect.objectContaining({
        cwd: '/Users/anner/Flowterm/src',
        history: '$ git status --short\n M src/App.tsx\n',
        sessionId: 'session-split',
      }),
    })
  })

  it('returns the same project state when the pane state does not change', () => {
    const state = applyTerminalAttachment(createProjectState(), splitAttachment)
    const nextState = updateTerminalState(state, {
      paneId: 'pane-split',
      projectId: 'project-a',
      sessionId: 'session-split',
      state: 'running',
    })

    expect(nextState).toBe(state)
  })
})

function createProjectState(): TerminalProjectState {
  return {
    paneOrder: [],
    panesById: {},
  }
}
