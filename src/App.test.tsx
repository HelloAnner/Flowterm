import { render, screen, waitFor } from '@testing-library/react'
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
  isTauriEnvironment: vi.fn(() => true),
  listenProjectRefresh: vi.fn().mockResolvedValue(unlisten),
  listenTerminalOutput: vi.fn().mockResolvedValue(unlisten),
  listenTerminalState: vi.fn().mockResolvedValue(unlisten),
  readFilePreview: vi.fn(),
  refreshProjectSnapshot: vi.fn(),
  removeProject: vi.fn(),
  resizeTerminal: vi.fn(),
  writeTerminal: vi.fn(),
}))

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
