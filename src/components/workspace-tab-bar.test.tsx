import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
        onReorderProjects={vi.fn()}
        onSelectProject={vi.fn()}
        projects={projects}
        recentProjects={projects}
      />,
    )

    const activeTab = screen.getByRole('tab', { name: /flowterm/i })
    expect(activeTab).toHaveAttribute('aria-current', 'page')
    expect(activeTab).toHaveAttribute('data-state', 'active')

    expect(
      within(activeTab).getByRole('img', { name: '未提交改动' }),
    ).toBeInTheDocument()
    expect(
      within(activeTab).getByRole('img', { name: 'Agent 运行中' }),
    ).toBeInTheDocument()
    expect(within(activeTab).queryByText('✦')).not.toBeInTheDocument()

    const idleTab = screen.getByRole('tab', { name: /paperclip/i })
    expect(idleTab).toHaveAttribute('data-state', 'inactive')
    expect(
      within(idleTab).queryByRole('img', { name: '未提交改动' }),
    ).not.toBeInTheDocument()
    expect(
      within(idleTab).queryByRole('img', { name: 'Agent 运行中' }),
    ).not.toBeInTheDocument()
  })

  it('opens the recent-project menu and selects a project from it', () => {
    const onSelectProject = vi.fn()

    render(
      <WorkspaceTabBar
        activeProjectId="project-a"
        onAddProject={vi.fn()}
        onRemoveProject={vi.fn()}
        onReorderProjects={vi.fn()}
        onSelectProject={onSelectProject}
        projects={projects}
        recentProjects={projects}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '最近项目' }))

    const menu = screen.getByRole('menu', { name: '最近项目列表' })
    expect(within(menu).getByText('/tmp/paperclip')).toBeInTheDocument()

    fireEvent.click(within(menu).getByRole('menuitem', { name: /paperclip/i }))

    expect(onSelectProject).toHaveBeenCalledWith('project-b')
  })

  it('filters recent projects by search text', async () => {
    const user = userEvent.setup()

    render(
      <WorkspaceTabBar
        activeProjectId="project-a"
        onAddProject={vi.fn()}
        onRemoveProject={vi.fn()}
        onReorderProjects={vi.fn()}
        onSelectProject={vi.fn()}
        projects={[
          ...projects,
          {
            changedFileCount: 0,
            hasLiveActivity: false,
            id: 'project-c',
            name: 'Notes Vault',
            path: '/tmp/notes',
            terminalState: 'idle',
            untrackedFileCount: 0,
          },
        ]}
        recentProjects={[
          ...projects,
          {
            changedFileCount: 0,
            hasLiveActivity: false,
            id: 'project-c',
            name: 'Notes Vault',
            path: '/tmp/notes',
            terminalState: 'idle',
            untrackedFileCount: 0,
          },
        ]}
      />,
    )

    await user.click(screen.getByRole('button', { name: '最近项目' }))
    await user.type(screen.getByRole('textbox', { name: '搜索最近项目' }), 'notes')

    const menu = screen.getByRole('menu', { name: '最近项目列表' })

    expect(within(menu).getByRole('menuitem', { name: /notes vault/i })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: /flowterm/i })).not.toBeInTheDocument()
  })

  it('selects the highlighted recent project with keyboard', async () => {
    const user = userEvent.setup()
    const onSelectProject = vi.fn()

    render(
      <WorkspaceTabBar
        activeProjectId="project-a"
        onAddProject={vi.fn()}
        onRemoveProject={vi.fn()}
        onReorderProjects={vi.fn()}
        onSelectProject={onSelectProject}
        projects={[
          ...projects,
          {
            changedFileCount: 0,
            hasLiveActivity: false,
            id: 'project-c',
            name: 'Notes Vault',
            path: '/tmp/notes',
            terminalState: 'idle',
            untrackedFileCount: 0,
          },
        ]}
        recentProjects={[
          ...projects,
          {
            changedFileCount: 0,
            hasLiveActivity: false,
            id: 'project-c',
            name: 'Notes Vault',
            path: '/tmp/notes',
            terminalState: 'idle',
            untrackedFileCount: 0,
          },
        ]}
      />,
    )

    await user.click(screen.getByRole('button', { name: '最近项目' }))
    const searchInput = screen.getByRole('textbox', { name: '搜索最近项目' })

    await user.type(searchInput, 'notes')
    fireEvent.keyDown(searchInput, { key: 'Enter' })

    expect(onSelectProject).toHaveBeenCalledWith('project-c')
  })

  it('reorders tabs with drag and drop', () => {
    const onReorderProjects = vi.fn()

    render(
      <WorkspaceTabBar
        activeProjectId="project-a"
        onAddProject={vi.fn()}
        onRemoveProject={vi.fn()}
        onReorderProjects={onReorderProjects}
        onSelectProject={vi.fn()}
        projects={projects}
        recentProjects={projects}
      />,
    )

    const dataTransfer = {
      effectAllowed: 'move',
      setData: vi.fn(),
    }

    fireEvent.dragStart(screen.getByRole('tab', { name: /flowterm/i }), { dataTransfer })
    fireEvent.dragOver(screen.getByRole('tab', { name: /paperclip/i }), { dataTransfer })
    fireEvent.drop(screen.getByRole('tab', { name: /paperclip/i }), { dataTransfer })

    expect(onReorderProjects).toHaveBeenCalledWith('project-a', 'project-b', 'before')
  })

  it('shows an insertion marker while dragging over another tab', () => {
    render(
      <WorkspaceTabBar
        activeProjectId="project-a"
        onAddProject={vi.fn()}
        onRemoveProject={vi.fn()}
        onReorderProjects={vi.fn()}
        onSelectProject={vi.fn()}
        projects={projects}
        recentProjects={projects}
      />,
    )

    const sourceTab = screen.getByRole('tab', { name: /flowterm/i })
    const targetTab = screen.getByRole('tab', { name: /paperclip/i })
    const dataTransfer = {
      effectAllowed: 'move',
      setData: vi.fn(),
    }

    vi.spyOn(targetTab, 'getBoundingClientRect').mockReturnValue({
      bottom: 40,
      height: 32,
      left: 100,
      right: 220,
      top: 8,
      width: 120,
      x: 100,
      y: 8,
      toJSON: () => ({}),
    })

    fireEvent.dragStart(sourceTab, { dataTransfer })
    fireEvent.dragOver(targetTab, { clientX: 210, dataTransfer })

    expect(targetTab).toHaveAttribute('data-drop-position', 'before')
  })
})
