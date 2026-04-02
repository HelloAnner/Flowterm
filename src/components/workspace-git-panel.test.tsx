import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { WorkspaceGitPanel } from './workspace-git-panel'

const repoFixture = {
  ahead: 0,
  behind: 0,
  branch: 'main',
  changedFiles: [],
  conflictCount: 0,
  conflictFiles: [],
  name: 'flowterm',
  path: '/tmp/flowterm',
  status: 'clean',
} as const

const {
  gitAiCommitRepoMock,
  gitPullAllReposMock,
  gitPushRepoMock,
  readFilePreviewMock,
  refreshGitReposMock,
  gitResolveConflictsRepoMock,
  gitStashPopRepoMock,
  gitStashSaveRepoMock,
  scanGitReposMock,
} = vi.hoisted(() => ({
  gitAiCommitRepoMock: vi.fn(),
  gitPullAllReposMock: vi.fn(),
  gitPushRepoMock: vi.fn(),
  readFilePreviewMock: vi.fn(),
  refreshGitReposMock: vi.fn(),
  gitResolveConflictsRepoMock: vi.fn(),
  gitStashPopRepoMock: vi.fn(),
  gitStashSaveRepoMock: vi.fn(),
  scanGitReposMock: vi.fn(),
}))

vi.mock('../lib/tauri', () => ({
  gitAiCommitRepo: gitAiCommitRepoMock,
  gitFetchRepos: vi.fn().mockResolvedValue(undefined),
  gitPullAllRepos: gitPullAllReposMock,
  gitPushRepo: gitPushRepoMock,
  readFilePreview: readFilePreviewMock,
  refreshGitRepos: refreshGitReposMock,
  gitResolveConflictsRepo: gitResolveConflictsRepoMock,
  gitStashPopRepo: gitStashPopRepoMock,
  gitStashSaveRepo: gitStashSaveRepoMock,
  isTauriEnvironment: vi.fn(() => true),
  scanGitRepos: scanGitReposMock,
}))

describe('WorkspaceGitPanel', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the active repository after scanning without crashing', async () => {
    scanGitReposMock.mockResolvedValue([repoFixture])

    expect(() =>
      render(<WorkspaceGitPanel activeProjectId="project-1" syntaxThemeId="vscode-dark" />),
    ).not.toThrow()

    await waitFor(() => {
      expect(screen.getByText('repositories')).toBeInTheDocument()
      expect(screen.getByText('flowterm')).toBeInTheDocument()
    })
  })

  it('debounces project refresh events before requesting an incremental git refresh', async () => {
    scanGitReposMock.mockResolvedValue([repoFixture])
    refreshGitReposMock.mockResolvedValue([repoFixture])

    render(<WorkspaceGitPanel activeProjectId="project-1" syntaxThemeId="vscode-dark" />)

    // Wait for initial scan to complete with real timers
    await waitFor(() => {
      expect(scanGitReposMock).toHaveBeenCalledWith('project-1')
    })

    // Switch to fake timers after initial scan settles
    vi.useFakeTimers()

    window.dispatchEvent(new Event('flowterm:project-refresh'))
    window.dispatchEvent(new Event('flowterm:project-refresh'))

    expect(refreshGitReposMock).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })

    expect(refreshGitReposMock).toHaveBeenCalledTimes(1)
    expect(refreshGitReposMock).toHaveBeenCalledWith('project-1', [repoFixture.path])
  })
})
