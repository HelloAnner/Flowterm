import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkspaceTerminal } from './workspace-terminal'

const {
  fitAddonFit,
  fitAddonProposeDimensions,
  resizeSchedulerMock,
  subscribeTerminalOutputMock,
  terminalConstructor,
} = vi.hoisted(() => ({
  terminalConstructor: vi.fn(),
  fitAddonFit: vi.fn(),
  fitAddonProposeDimensions: vi.fn(() => ({ cols: 80, rows: 24 })),
  subscribeTerminalOutputMock: vi.fn(() => () => {}),
  resizeSchedulerMock: Object.assign(vi.fn(), { cancel: vi.fn() }),
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class MockTerminal {
    constructor(options: unknown) {
      terminalConstructor(options)
    }
    dispose = vi.fn()
    loadAddon = vi.fn()
    onData = vi.fn()
    open = vi.fn()
    reset = vi.fn()
    write = vi.fn()
  },
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class MockFitAddon {
    fit = fitAddonFit
    proposeDimensions = fitAddonProposeDimensions
  },
}))

vi.mock('../features/workspace/terminal-stream', () => ({
  subscribeTerminalOutput: subscribeTerminalOutputMock,
}))

vi.mock('../features/workspace/terminal-resize', () => ({
  createTerminalResizeScheduler: vi.fn(() => resizeSchedulerMock),
}))

describe('WorkspaceTerminal', () => {
  beforeEach(() => {
    terminalConstructor.mockClear()
    fitAddonFit.mockClear()
    fitAddonProposeDimensions.mockClear()
    subscribeTerminalOutputMock.mockClear()
    resizeSchedulerMock.mockClear()
    resizeSchedulerMock.cancel.mockClear()

    class ResizeObserverMock {
      disconnect = vi.fn()
      observe = vi.fn()
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('creates xterm with a tighter line height for readable density', () => {
    render(
      <WorkspaceTerminal
        onAddPane={vi.fn()}
        onLayout={vi.fn()}
        onRemovePane={vi.fn()}
        paneSizes={[100]}
        panes={[
          {
            agentStatus: {
              agent: 'claude-code',
              phase: 'idle',
            },
            cwd: '/tmp/demo',
            history: '$ echo hello',
            id: 'main',
            projectId: 'project-a',
            sessionId: 'session-a',
            shellLabel: 'zsh',
            state: 'idle',
          },
        ]}
        resizeTerminal={vi.fn().mockResolvedValue(undefined)}
        theme={{
          background: '#000000',
          cursor: '#ffffff',
          foreground: '#cccccc',
        }}
        writeTerminal={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    expect(terminalConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        fontSize: 13,
        lineHeight: 1.35,
      }),
    )
  })
})
