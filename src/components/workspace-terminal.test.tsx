import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkspaceTerminal } from './workspace-terminal'

const {
  claimTerminalHistoryMock,
  fitAddonFit,
  fitAddonProposeDimensions,
  resizeSchedulerMock,
  subscribeTerminalOutputMock,
  terminalConstructor,
} = vi.hoisted(() => ({
  claimTerminalHistoryMock: vi.fn((_: string, history: string) => history),
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
  claimTerminalHistory: claimTerminalHistoryMock,
  subscribeTerminalOutput: subscribeTerminalOutputMock,
}))

vi.mock('../features/workspace/terminal-resize', () => ({
  createTerminalResizeScheduler: vi.fn(() => resizeSchedulerMock),
}))

describe('WorkspaceTerminal', () => {
  beforeEach(() => {
    terminalConstructor.mockClear()
    claimTerminalHistoryMock.mockClear()
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
        activePaneId={null}
        isSplitView={true}
        onAddPane={vi.fn()}
        onLayout={vi.fn()}
        onRemovePane={vi.fn()}
        onSelectPane={vi.fn()}
        onSetRailWidth={vi.fn()}
        onToggleSplitView={vi.fn()}
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
        railWidth={44}
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
        fontSize: 12,
        letterSpacing: -0.6,
        lineHeight: 1.22,
      }),
    )
  })

  it('uses pane names instead of repeating the shell label in the session rail', () => {
    render(
      <WorkspaceTerminal
        activePaneId="main"
        isSplitView={true}
        onAddPane={vi.fn()}
        onLayout={vi.fn()}
        onRemovePane={vi.fn()}
        onSelectPane={vi.fn()}
        onSetRailWidth={vi.fn()}
        onToggleSplitView={vi.fn()}
        paneSizes={[50, 50]}
        panes={[
          {
            agentStatus: {
              agent: 'claude-code',
              phase: 'idle',
            },
            cwd: '/tmp/flowterm',
            history: '$ pwd',
            id: 'main',
            projectId: 'project-a',
            sessionId: 'session-a',
            shellLabel: 'zsh',
            state: 'idle',
          },
          {
            agentStatus: {
              agent: 'claude-code',
              phase: 'running',
            },
            cwd: '/tmp/docs',
            history: '$ ls',
            id: 'pane-second',
            projectId: 'project-a',
            sessionId: 'session-b',
            shellLabel: 'zsh',
            state: 'running',
          },
        ]}
        railWidth={160}
        resizeTerminal={vi.fn().mockResolvedValue(undefined)}
        theme={{
          background: '#000000',
          cursor: '#ffffff',
          foreground: '#cccccc',
        }}
        writeTerminal={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    expect(screen.getAllByText('flowterm').length).toBeGreaterThan(0)
    expect(screen.getAllByText('docs').length).toBeGreaterThan(0)
  })

  it('renders icon-only layout controls instead of split text buttons', () => {
    render(
      <WorkspaceTerminal
        activePaneId="main"
        isSplitView={true}
        onAddPane={vi.fn()}
        onLayout={vi.fn()}
        onRemovePane={vi.fn()}
        onSelectPane={vi.fn()}
        onSetRailWidth={vi.fn()}
        onToggleSplitView={vi.fn()}
        paneSizes={[50, 50]}
        panes={[
          {
            agentStatus: {
              agent: 'claude-code',
              phase: 'idle',
            },
            cwd: '/tmp/flowterm',
            history: '$ pwd',
            id: 'main',
            projectId: 'project-a',
            sessionId: 'session-a',
            shellLabel: 'zsh',
            state: 'idle',
          },
          {
            agentStatus: {
              agent: 'claude-code',
              phase: 'running',
            },
            cwd: '/tmp/docs',
            history: '$ ls',
            id: 'pane-second',
            projectId: 'project-a',
            sessionId: 'session-b',
            shellLabel: 'zsh',
            state: 'running',
          },
        ]}
        railWidth={160}
        resizeTerminal={vi.fn().mockResolvedValue(undefined)}
        theme={{
          background: '#000000',
          cursor: '#ffffff',
          foreground: '#cccccc',
        }}
        writeTerminal={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    expect(screen.getByRole('button', { name: '切换终端布局' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '分栏' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '单窗' })).not.toBeInTheDocument()
  })

  it('uses semantic terminal surface classes instead of hardcoded dark glass fills', () => {
    const { container } = render(
      <WorkspaceTerminal
        activePaneId="main"
        isSplitView={true}
        onAddPane={vi.fn()}
        onLayout={vi.fn()}
        onRemovePane={vi.fn()}
        onSelectPane={vi.fn()}
        onSetRailWidth={vi.fn()}
        onToggleSplitView={vi.fn()}
        paneSizes={[50, 50]}
        panes={[
          {
            agentStatus: {
              agent: 'claude-code',
              phase: 'idle',
            },
            cwd: '/tmp/flowterm',
            history: '$ pwd',
            id: 'main',
            projectId: 'project-a',
            sessionId: 'session-a',
            shellLabel: 'zsh',
            state: 'idle',
          },
          {
            agentStatus: {
              agent: 'claude-code',
              phase: 'running',
            },
            cwd: '/tmp/docs',
            history: '$ ls',
            id: 'pane-second',
            projectId: 'project-a',
            sessionId: 'session-b',
            shellLabel: 'zsh',
            state: 'running',
          },
        ]}
        railWidth={160}
        resizeTerminal={vi.fn().mockResolvedValue(undefined)}
        theme={{
          background: '#ffffff',
          cursor: '#4e8fce',
          foreground: '#1a1a1a',
        }}
        writeTerminal={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    expect(container.querySelector('.terminal-glass-panel')).not.toBeNull()
    expect(container.querySelector('.terminal-chip')).not.toBeNull()
    expect(container.innerHTML).not.toContain('bg-[rgba(255,255,255,0.02)]')
    expect(container.innerHTML).not.toContain('bg-[rgba(255,255,255,0.03)]')
  })
})
