import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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
  gitResolveConflictsRepoMock,
  gitStashPopRepoMock,
  gitStashSaveRepoMock,
  scanGitReposMock,
} = vi.hoisted(() => ({
  gitAiCommitRepoMock: vi.fn(),
  gitPullAllReposMock: vi.fn(),
  gitPushRepoMock: vi.fn(),
  gitResolveConflictsRepoMock: vi.fn(),
  gitStashPopRepoMock: vi.fn(),
  gitStashSaveRepoMock: vi.fn(),
  scanGitReposMock: vi.fn(),
}))

vi.mock('../lib/tauri', () => ({
  gitAiCommitRepo: gitAiCommitRepoMock,
  gitPullAllRepos: gitPullAllReposMock,
  gitPushRepo: gitPushRepoMock,
  gitResolveConflictsRepo: gitResolveConflictsRepoMock,
  gitStashPopRepo: gitStashPopRepoMock,
  gitStashSaveRepo: gitStashSaveRepoMock,
  isTauriEnvironment: vi.fn(() => true),
  scanGitRepos: scanGitReposMock,
}))

describe('WorkspaceGitPanel', () => {
  it('renders the active repository after scanning without crashing', async () => {
    scanGitReposMock.mockResolvedValue([repoFixture])

    expect(() =>
      render(<WorkspaceGitPanel activeProjectId="project-1" />),
    ).not.toThrow()

    await waitFor(() => {
      expect(screen.getByText('repositories')).toBeInTheDocument()
    })

    expect(screen.getAllByText('flowterm')).toHaveLength(2)
  })
})
