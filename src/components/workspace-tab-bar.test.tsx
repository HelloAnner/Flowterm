import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { WorkspaceTabBar } from './workspace-tab-bar'
import type { ProjectSummary } from '../lib/contracts'

const projects: ProjectSummary[] = [
  {
    changedFileCount: 2,
    hasLiveActivity: false,
    id: 'project-a',
    name: 'Flowterm',
    path: '/tmp/flowterm',
    terminalState: 'running',
    untrackedFileCount: 1,
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
]

describe('WorkspaceTabBar', () => {
  it('shows a dirty dot for changed projects and a pulse indicator for running agents', () => {
    render(
      <WorkspaceTabBar
        activeProjectId="project-a"
        onAddProject={vi.fn()}
        onRemoveProject={vi.fn()}
        onSelectProject={vi.fn()}
        projects={projects}
      />,
    )

    const activeTab = screen.getByRole('button', { name: /flowterm/i })

    expect(
      within(activeTab).getByRole('img', { name: '未提交改动' }),
    ).toBeInTheDocument()
    expect(
      within(activeTab).getByRole('img', { name: 'Agent 运行中' }),
    ).toBeInTheDocument()
    expect(within(activeTab).queryByText('✦')).not.toBeInTheDocument()

    const idleTab = screen.getByRole('button', { name: /paperclip/i })
    expect(
      within(idleTab).queryByRole('img', { name: '未提交改动' }),
    ).not.toBeInTheDocument()
    expect(
      within(idleTab).queryByRole('img', { name: 'Agent 运行中' }),
    ).not.toBeInTheDocument()
  })
})
