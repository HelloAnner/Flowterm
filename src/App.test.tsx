import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { useWorkspaceStore } from './stores/workspace-store'

const { neverSettledBootstrap, unlisten } = vi.hoisted(() => ({
  neverSettledBootstrap: new Promise<never>(() => {}),
  unlisten: vi.fn(),
}))

vi.mock('./lib/tauri', () => ({
  activateProject: vi.fn(),
  addProject: vi.fn(),
  attachTerminal: vi.fn(),
  bootstrapApp: vi.fn(() => neverSettledBootstrap),
  closeTerminal: vi.fn(),
  completePerformanceProbe: vi.fn(),
  isTauriEnvironment: vi.fn(() => true),
  listTerminals: vi.fn(),
  listenAgentStatus: vi.fn().mockResolvedValue(unlisten),
  listenProjectRefresh: vi.fn().mockResolvedValue(unlisten),
  listenTerminalOutput: vi.fn().mockResolvedValue(unlisten),
  listenTerminalState: vi.fn().mockResolvedValue(unlisten),
  readFilePreview: vi.fn(),
  readPerformanceProbeState: vi.fn().mockResolvedValue({
    enabled: false,
    processUptimeMs: 0,
    scenario: null,
  }),
  readProjectWorkspace: vi.fn(),
  refreshProjectSnapshot: vi.fn(),
  removeProject: vi.fn(),
  resizeTerminal: vi.fn(),
  saveProjectWorkspace: vi.fn(),
  writeTerminal: vi.fn(),
}))

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.style.cssText = ''
    useWorkspaceStore.setState({
      activeProjectId: null,
      draftName: '',
      draftPath: '',
      error: null,
      filePreview: null,
      isBooting: true,
      isFilePreviewLoading: false,
      isProjectDialogOpen: false,
      previewRequestId: 0,
      projects: [],
      selectedFilePath: null,
      snapshot: null,
      terminalProjectStateByProject: {},
      workspaceStateByProject: {},
    })
  })

  it('keeps rendering the booting state while tauri bootstrap is pending', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<App />)

    await waitFor(() => {
      expect(
        screen.getByText('正在准备 Flowterm 工作台...'),
      ).toBeInTheDocument()
    })

    expect(
      consoleError.mock.calls.some(([message]) =>
        String(message).includes('getSnapshot should be cached'),
      ),
    ).toBe(false)
  })

  it('opens the command palette with the VS Code shortcut and applies the GitHub theme', async () => {
    const user = userEvent.setup()

    useWorkspaceStore.setState({
      isBooting: false,
    })

    render(<App />)

    fireEvent.keyDown(window, {
      key: 'P',
      metaKey: true,
      shiftKey: true,
    })

    const input = await screen.findByRole('combobox', {
      name: 'Command Palette',
    })

    await user.type(input, 'theme')
    await user.keyboard('{Enter}{ArrowDown}{Enter}')

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('github-dark-default')
    })
  })

  it('opens the add-project dialog from the command palette', async () => {
    const user = userEvent.setup()

    useWorkspaceStore.setState({
      isBooting: false,
    })

    render(<App />)

    fireEvent.keyDown(window, {
      key: 'P',
      metaKey: true,
      shiftKey: true,
    })

    const input = await screen.findByRole('combobox', {
      name: 'Command Palette',
    })

    await user.type(input, 'open project')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(useWorkspaceStore.getState().isProjectDialogOpen).toBe(true)
    })
  })
})
