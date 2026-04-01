import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  WorkspaceSettings,
  type WorkspaceSettingsSection,
} from './workspace-settings'
import type { ProjectFileEntry, ProjectSummary } from '../lib/contracts'

const files: ProjectFileEntry[] = [
  {
    gitStatus: 'M',
    kind: 'file',
    liveStatus: 'modified',
    path: 'src/App.tsx',
  },
  {
    gitStatus: '?',
    kind: 'file',
    liveStatus: 'idle',
    path: 'README.md',
  },
]

const projects: ProjectSummary[] = [
  {
    changedFileCount: 1,
    hasLiveActivity: true,
    id: 'flowterm',
    name: 'Flowterm',
    path: '/tmp/flowterm',
    terminalState: 'running',
    untrackedFileCount: 1,
  },
]

function renderSettings(selectedSection: WorkspaceSettingsSection = 'appearance') {
  return render(
    <WorkspaceSettings
      activeProjectId="flowterm"
      activeThemeId="flowterm-warm-dark"
      files={files}
      onOpenProject={vi.fn()}
      onSelectSection={vi.fn()}
      onSelectTheme={vi.fn()}
      onUpdateTerminalTypography={vi.fn()}
      projects={projects}
      selectedSection={selectedSection}
      terminalTypography={{
        fontSize: 12,
        letterSpacing: -0.6,
        lineHeight: 1.22,
      }}
    />,
  )
}

describe('WorkspaceSettings', () => {
  beforeEach(() => {
    class ResizeObserverMock {
      disconnect = vi.fn()
      observe = vi.fn()
      unobserve = vi.fn()
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the theme groups inside the appearance section', () => {
    renderSettings()

    expect(screen.getByRole('heading', { name: '外观' })).toBeInTheDocument()
    expect(screen.getByText('界面主题')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /GitHub Dark Default/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Catppuccin Latte/i })).toBeInTheDocument()
  })

  it('shows workspace metrics in the workspace section', () => {
    renderSettings('workspace')

    expect(screen.getByRole('heading', { name: '工作区' })).toBeInTheDocument()
    expect(screen.getByText('Flowterm')).toBeInTheDocument()
    expect(screen.getByText('运行中')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '打开项目' })).toBeInTheDocument()
  })

  it('delegates category switching through the settings sidebar', async () => {
    const user = userEvent.setup()
    const onSelectSection = vi.fn()

    render(
      <WorkspaceSettings
        activeProjectId="flowterm"
        activeThemeId="flowterm-warm-dark"
        files={files}
        onOpenProject={vi.fn()}
        onSelectSection={onSelectSection}
        onSelectTheme={vi.fn()}
        onUpdateTerminalTypography={vi.fn()}
        projects={projects}
        selectedSection="appearance"
        terminalTypography={{
          fontSize: 12,
          letterSpacing: -0.6,
          lineHeight: 1.22,
        }}
      />,
    )

    await user.click(screen.getByRole('button', { name: /快捷键/ }))

    expect(onSelectSection).toHaveBeenCalledWith('shortcuts')
  })

  it('updates terminal typography from the appearance section', async () => {
    const onUpdateTerminalTypography = vi.fn()

    render(
      <WorkspaceSettings
        activeProjectId="flowterm"
        activeThemeId="flowterm-warm-dark"
        files={files}
        onOpenProject={vi.fn()}
        onSelectSection={vi.fn()}
        onSelectTheme={vi.fn()}
        onUpdateTerminalTypography={onUpdateTerminalTypography}
        projects={projects}
        selectedSection="appearance"
        terminalTypography={{
          fontSize: 12,
          letterSpacing: -0.6,
          lineHeight: 1.22,
        }}
      />,
    )

    const fontSizeInput = screen.getByRole('spinbutton', { name: '终端字号' })

    fireEvent.change(fontSizeInput, {
      target: {
        value: '14',
      },
    })

    expect(onUpdateTerminalTypography).toHaveBeenLastCalledWith({ fontSize: 14 })
  })
})
