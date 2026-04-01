import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { THEME_STORAGE_KEY } from './features/theme/theme-registry'
import { useWorkspaceStore } from './stores/workspace-store'

const {
  addProjectMock,
  bootstrapAppMock,
  dialogOpenMock,
  listenAgentStatusMock,
  listenProjectRefreshMock,
  listenTerminalOutputMock,
  listenTerminalStateMock,
  neverSettledBootstrap,
  unlisten,
} = vi.hoisted(() => ({
  addProjectMock: vi.fn(),
  bootstrapAppMock: vi.fn(() => new Promise<never>(() => {})),
  dialogOpenMock: vi.fn(),
  listenAgentStatusMock: vi.fn(),
  listenProjectRefreshMock: vi.fn(),
  listenTerminalOutputMock: vi.fn(),
  listenTerminalStateMock: vi.fn(),
  neverSettledBootstrap: new Promise<never>(() => {}),
  unlisten: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: dialogOpenMock,
}))

vi.mock('./lib/tauri', () => ({
  activateProject: vi.fn(),
  addProject: addProjectMock,
  attachTerminal: vi.fn(),
  bootstrapApp: bootstrapAppMock,
  closeTerminal: vi.fn(),
  completePerformanceProbe: vi.fn(),
  createProjectEntry: vi.fn(),
  isTauriEnvironment: vi.fn(() => true),
  listTerminals: vi.fn(),
  listenAgentStatus: listenAgentStatusMock,
  listenProjectRefresh: listenProjectRefreshMock,
  listenTerminalOutput: listenTerminalOutputMock,
  listenTerminalState: listenTerminalStateMock,
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
  writeProjectFile: vi.fn(),
  writeTerminal: vi.fn(),
}))

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    bootstrapAppMock.mockReturnValue(neverSettledBootstrap)
    listenAgentStatusMock.mockResolvedValue(unlisten)
    listenProjectRefreshMock.mockResolvedValue(unlisten)
    listenTerminalOutputMock.mockResolvedValue(unlisten)
    listenTerminalStateMock.mockResolvedValue(unlisten)
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.style.cssText = ''
    window.localStorage.removeItem(THEME_STORAGE_KEY)
    useWorkspaceStore.setState({
      activeProjectId: null,
      error: null,
      filePreview: null,
      isBooting: true,
      isFilePreviewLoading: false,
      previewRequestId: 0,
      projects: [],
      recentProjectIds: [],
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

  it('binds terminal listeners before bootstrap restores sessions', async () => {
    render(<App />)

    await waitFor(() => {
      expect(listenTerminalOutputMock).toHaveBeenCalled()
      expect(listenTerminalStateMock).toHaveBeenCalled()
      expect(bootstrapAppMock).toHaveBeenCalled()
    })

    expect(listenTerminalOutputMock.mock.invocationCallOrder[0]).toBeLessThan(
      bootstrapAppMock.mock.invocationCallOrder[0],
    )
    expect(listenTerminalStateMock.mock.invocationCallOrder[0]).toBeLessThan(
      bootstrapAppMock.mock.invocationCallOrder[0],
    )
  })

  it('opens the command palette with the VS Code shortcut and applies the GitHub theme', async () => {
    const user = userEvent.setup()

    useWorkspaceStore.setState({
      bootstrap: vi.fn().mockResolvedValue(undefined),
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
    await user.keyboard('{Enter}')
    await user.clear(input)
    await user.type(input, 'github')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('github-dark-default')
    })
  })

  it('previews a theme live in the command palette and restores it on escape', async () => {
    const user = userEvent.setup()

    useWorkspaceStore.setState({
      activeThemeId: 'flowterm-warm-dark',
      bootstrap: vi.fn().mockResolvedValue(undefined),
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
    await user.keyboard('{Enter}{ArrowDown}')

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('vscode-dark')
    })

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('flowterm-warm-dark')
    })
  })

  it('opens the native directory picker from the command palette and adds the folder with its own name', async () => {
    const user = userEvent.setup()
    dialogOpenMock.mockResolvedValue('/tmp/flowterm-notes')
    addProjectMock.mockResolvedValue({
      activeProjectId: 'flowterm-notes',
      projects: [],
      snapshot: null,
      terminals: [],
      workspaceState: null,
    })

    useWorkspaceStore.setState({
      bootstrap: vi.fn().mockResolvedValue(undefined),
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
      expect(dialogOpenMock).toHaveBeenCalledWith({
        directory: true,
        multiple: false,
        title: '选择项目目录',
      })
    })

    expect(addProjectMock).toHaveBeenCalledWith('/tmp/flowterm-notes', 'flowterm-notes')
  })

  it('switches projects with command and arrow keys', async () => {
    useWorkspaceStore.setState({
      activeProjectId: 'project-a',
      bootstrap: vi.fn().mockResolvedValue(undefined),
      cycleProjectSelection: vi.fn().mockImplementation(async () => {
        useWorkspaceStore.setState({ activeProjectId: 'project-b' })
      }),
      isBooting: false,
      projects: [
        {
          changedFileCount: 0,
          hasLiveActivity: false,
          id: 'project-a',
          name: 'Flowterm',
          path: '/tmp/flowterm',
          terminalState: 'idle',
          untrackedFileCount: 0,
        },
        {
          changedFileCount: 0,
          hasLiveActivity: false,
          id: 'project-b',
          name: 'Paperclip',
          path: '/tmp/paperclip',
          terminalState: 'idle',
          untrackedFileCount: 0,
        },
      ],
    })

    render(<App />)

    fireEvent.keyDown(window, {
      key: 'ArrowRight',
      metaKey: true,
    })

    await waitFor(() => {
      expect(useWorkspaceStore.getState().activeProjectId).toBe('project-b')
    })
  })

  it('shows the settings page when the sidebar settings button is selected', async () => {
    const user = userEvent.setup()

    useWorkspaceStore.setState({
      activeProjectId: 'project-a',
      bootstrap: vi.fn().mockResolvedValue(undefined),
      isBooting: false,
      projects: [
        {
          changedFileCount: 1,
          hasLiveActivity: true,
          id: 'project-a',
          name: 'Flowterm',
          path: '/tmp/flowterm',
          terminalState: 'running',
          untrackedFileCount: 0,
        },
      ],
      snapshot: {
        backend: 'xterm',
        files: [
          {
            gitStatus: 'M',
            kind: 'file',
            liveStatus: 'modified',
            path: 'src/App.tsx',
          },
        ],
        project: {
          changedFileCount: 1,
          hasLiveActivity: true,
          id: 'project-a',
          name: 'Flowterm',
          path: '/tmp/flowterm',
          terminalState: 'running',
          untrackedFileCount: 0,
        },
      },
    })

    render(<App />)

    await user.click(screen.getByRole('button', { name: '设置' }))

    expect(
      await screen.findByRole('heading', {
        name: '外观',
      }),
    ).toBeInTheDocument()
  })
})
