import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { CommandPalette } from './command-palette'

describe('CommandPalette', () => {
  it('shows project, file, terminal, and theme commands at the root', () => {
    render(
      <CommandPalette
        activeProjectId="project-a"
        activeThemeId="flowterm-warm-dark"
        files={[
          { path: 'README.md' },
          { path: 'src/App.tsx' },
        ]}
        isOpen
        onClose={vi.fn()}
        onOpenProject={vi.fn()}
        onSelectFile={vi.fn()}
        onSelectProject={vi.fn()}
        onSelectTheme={vi.fn()}
        onSplitTerminal={vi.fn()}
        projects={[
          { id: 'project-a', label: 'Flowterm', active: true },
          { id: 'project-b', label: 'Notes', active: false },
        ]}
      />,
    )

    expect(screen.getByRole('option', { name: /Preferences: Color Theme/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Projects: Open Project/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Projects: Switch Project/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Files: Open File/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Terminal: Split Terminal/i })).toBeInTheDocument()
  })

  it('opens the color theme picker and lists the modern bundled themes', async () => {
    const user = userEvent.setup()
    const handleClose = vi.fn()
    const handleSelectTheme = vi.fn()

    render(
      <CommandPalette
        activeProjectId="project-a"
        activeThemeId="flowterm-warm-dark"
        files={[]}
        isOpen
        onClose={handleClose}
        onOpenProject={vi.fn()}
        onSelectFile={vi.fn()}
        onSelectProject={vi.fn()}
        onSelectTheme={handleSelectTheme}
        onSplitTerminal={vi.fn()}
        projects={[]}
      />,
    )

    const input = screen.getByRole('combobox', { name: 'Command Palette' })

    await user.type(input, 'theme')
    expect(
      screen.getByRole('option', { name: /Preferences: Color Theme/i }),
    ).toBeInTheDocument()

    await user.keyboard('{Enter}')

    expect(
      screen.getByRole('heading', { name: 'Preferences: Color Theme' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Dark')).toBeInTheDocument()
    expect(screen.getByText('Light')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Cursor Dark/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Ghostty Dark/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Tokyo Night/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Night Owl/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Nord/i })).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: /GitHub Dark Default/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /IntelliJ Light/i })).toBeInTheDocument()

    await user.clear(input)
    await user.type(input, 'github')
    await user.keyboard('{Enter}')

    expect(handleSelectTheme).toHaveBeenCalledWith('github-dark-default')
    expect(handleClose).toHaveBeenCalled()
  })

  it('opens the file picker and selects a file', async () => {
    const user = userEvent.setup()
    const handleClose = vi.fn()
    const handleSelectFile = vi.fn()

    render(
      <CommandPalette
        activeProjectId="project-a"
        activeThemeId="flowterm-warm-dark"
        files={[
          { path: 'README.md' },
          { path: 'src/App.tsx' },
        ]}
        isOpen
        onClose={handleClose}
        onOpenProject={vi.fn()}
        onSelectFile={handleSelectFile}
        onSelectProject={vi.fn()}
        onSelectTheme={vi.fn()}
        onSplitTerminal={vi.fn()}
        projects={[]}
      />,
    )

    const input = screen.getByRole('combobox', { name: 'Command Palette' })
    await user.type(input, 'open file')
    await user.keyboard('{Enter}{ArrowDown}{Enter}')

    expect(screen.getByRole('heading', { name: 'Files: Open File' })).toBeInTheDocument()
    expect(handleSelectFile).toHaveBeenCalledWith('src/App.tsx')
    expect(handleClose).toHaveBeenCalled()
  })

  it('executes direct commands like opening a project and splitting the terminal', async () => {
    const user = userEvent.setup()
    const handleClose = vi.fn()
    const handleOpenProject = vi.fn()
    const handleSplitTerminal = vi.fn()

    render(
      <CommandPalette
        activeProjectId="project-a"
        activeThemeId="flowterm-warm-dark"
        files={[]}
        isOpen
        onClose={handleClose}
        onOpenProject={handleOpenProject}
        onSelectFile={vi.fn()}
        onSelectProject={vi.fn()}
        onSelectTheme={vi.fn()}
        onSplitTerminal={handleSplitTerminal}
        projects={[]}
      />,
    )

    const input = screen.getByRole('combobox', { name: 'Command Palette' })

    await user.type(input, 'open project')
    await user.keyboard('{Enter}')
    expect(handleOpenProject).toHaveBeenCalled()

    await user.clear(input)
    await user.type(input, 'split terminal')
    await user.keyboard('{Enter}')
    expect(handleSplitTerminal).toHaveBeenCalled()
  })
})
