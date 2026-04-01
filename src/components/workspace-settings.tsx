import {
  FolderOpen,
  Info,
  Keyboard,
  Palette,
  type LucideIcon,
} from 'lucide-react'
import { type ReactElement, useMemo } from 'react'

import { ScrollArea } from './ui/scroll-area'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { listThemes } from '../features/theme/theme-registry'
import { summarizeProjectSnapshot } from '../features/workspace/tree'
import type { TerminalTypography } from '../features/workspace/terminal-preferences'
import type { ProjectFileEntry, ProjectSummary, TerminalState } from '../lib/contracts'
import { cn } from '../lib/utils'

export type WorkspaceSettingsSection =
  | 'about'
  | 'appearance'
  | 'shortcuts'
  | 'workspace'

interface WorkspaceSettingsProps {
  activeProjectId: string | null
  activeThemeId: string
  files: ProjectFileEntry[]
  onOpenProject: () => void
  onSelectSection: (section: WorkspaceSettingsSection) => void
  onSelectTheme: (themeId: string) => void
  onUpdateTerminalTypography: (value: Partial<TerminalTypography>) => void
  projects: ProjectSummary[]
  selectedSection: WorkspaceSettingsSection
  terminalTypography: TerminalTypography
}

interface SettingsSectionDescriptor {
  description: string
  icon: LucideIcon
  id: WorkspaceSettingsSection
  label: string
}

const SETTINGS_SECTIONS: SettingsSectionDescriptor[] = [
  {
    description: '主题与界面气质',
    icon: Palette,
    id: 'appearance',
    label: '外观',
  },
  {
    description: '项目与工作区状态',
    icon: FolderOpen,
    id: 'workspace',
    label: '工作区',
  },
  {
    description: '常用操作入口',
    icon: Keyboard,
    id: 'shortcuts',
    label: '快捷键',
  },
  {
    description: 'Flowterm 的定位',
    icon: Info,
    id: 'about',
    label: '关于',
  },
]

export function WorkspaceSettings({
  activeProjectId,
  activeThemeId,
  files,
  onOpenProject,
  onSelectSection,
  onSelectTheme,
  onUpdateTerminalTypography,
  projects,
  selectedSection,
  terminalTypography,
}: WorkspaceSettingsProps): ReactElement {
  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects],
  )
  const summary = useMemo(() => summarizeProjectSnapshot(files), [files])
  const themes = useMemo(() => listThemes(), [])
  const themesByScheme = useMemo(
    () => ({
      dark: themes.filter((theme) => theme.colorScheme === 'dark'),
      light: themes.filter((theme) => theme.colorScheme === 'light'),
    }),
    [themes],
  )
  const selectedDescriptor =
    SETTINGS_SECTIONS.find((section) => section.id === selectedSection) ?? SETTINGS_SECTIONS[0]

  return (
    <div className="flex h-full min-h-0 bg-[var(--bg-base)]">
      <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-elevated)]/80">
        <div className="border-b border-[var(--border-subtle)] px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
            Preferences
          </p>
          <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
            设置
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
            像 VS Code 一样，用场景化分组管理 Flowterm 的工作台配置。
          </p>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-3">
          {SETTINGS_SECTIONS.map((section) => {
            const Icon = section.icon

            return (
              <button
                aria-current={selectedSection === section.id ? 'page' : undefined}
                className={cn(
                  'flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition-colors',
                  selectedSection === section.id
                    ? 'border-[var(--sidebar-active-border)] bg-[var(--sidebar-active-bg)] text-[var(--text-primary)] shadow-[var(--surface-shadow)]'
                    : 'border-transparent text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]',
                )}
                key={section.id}
                onClick={() => onSelectSection(section.id)}
                type="button"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{section.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">
                    {section.description}
                  </span>
                </span>
              </button>
            )
          })}
        </nav>
      </aside>
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-8 py-8">
          <div className="border-b border-[var(--border-subtle)] pb-6">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
              {selectedDescriptor.description}
            </p>
            <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
              {selectedDescriptor.label}
            </h1>
          </div>
          <div className="flex-1 py-6">
            {selectedSection === 'appearance' ? (
              <AppearanceSection
                activeThemeId={activeThemeId}
                onSelectTheme={onSelectTheme}
                onUpdateTerminalTypography={onUpdateTerminalTypography}
                terminalTypography={terminalTypography}
                themesByScheme={themesByScheme}
              />
            ) : null}
            {selectedSection === 'workspace' ? (
              <WorkspaceSection
                activeProject={activeProject}
                onOpenProject={onOpenProject}
                projectCount={projects.length}
                summary={summary}
              />
            ) : null}
            {selectedSection === 'shortcuts' ? <ShortcutsSection /> : null}
            {selectedSection === 'about' ? (
              <AboutSection projectCount={projects.length} themeCount={themes.length} />
            ) : null}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}

function AppearanceSection({
  activeThemeId,
  onSelectTheme,
  onUpdateTerminalTypography,
  terminalTypography,
  themesByScheme,
}: {
  activeThemeId: string
  onSelectTheme: (themeId: string) => void
  onUpdateTerminalTypography: (value: Partial<TerminalTypography>) => void
  terminalTypography: TerminalTypography
  themesByScheme: {
    dark: ReturnType<typeof listThemes>
    light: ReturnType<typeof listThemes>
  }
}): ReactElement {
  return (
    <section className="space-y-8">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)]">
        <SettingsCard
          description="主题会同步作用于工作台、代码预览和终端配色。"
          title="界面主题"
        >
          <div className="space-y-6">
            <ThemeGroup
              activeThemeId={activeThemeId}
              label="Dark"
              onSelectTheme={onSelectTheme}
              themes={themesByScheme.dark}
            />
            <ThemeGroup
              activeThemeId={activeThemeId}
              label="Light"
              onSelectTheme={onSelectTheme}
              themes={themesByScheme.light}
            />
          </div>
        </SettingsCard>
        <SettingsCard
          description="保持界面质感一致，让 Flowterm 看起来像同一个空间。"
          title="当前体验"
        >
          <ul className="space-y-3 text-sm leading-6 text-[var(--text-secondary)]">
            <li>主题即时生效，无需刷新。</li>
            <li>深浅色自动同步到浏览器 `color-scheme`。</li>
            <li>代码预览与终端使用同一主题包。</li>
          </ul>
        </SettingsCard>
      </div>
      <SettingsCard
        description="直接调整 xterm 的排版密度，优先影响可读性与紧凑度。"
        title="终端排版"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <TypographyField
            description="推荐 11–14"
            label="终端字号"
            onChange={(value) => onUpdateTerminalTypography({ fontSize: value })}
            step="1"
            value={terminalTypography.fontSize}
          />
          <TypographyField
            description="推荐 1.15–1.35"
            label="终端行高"
            onChange={(value) => onUpdateTerminalTypography({ lineHeight: value })}
            step="0.01"
            value={terminalTypography.lineHeight}
          />
          <TypographyField
            description="负值更紧凑"
            label="字间距"
            onChange={(value) => onUpdateTerminalTypography({ letterSpacing: value })}
            step="0.1"
            value={terminalTypography.letterSpacing}
          />
        </div>
      </SettingsCard>
    </section>
  )
}

function ThemeGroup({
  activeThemeId,
  label,
  onSelectTheme,
  themes,
}: {
  activeThemeId: string
  label: string
  onSelectTheme: (themeId: string) => void
  themes: ReturnType<typeof listThemes>
}): ReactElement {
  return (
    <div>
      <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
        {label}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {themes.map((theme) => (
          <button
            className={cn(
              'rounded-2xl border px-4 py-4 text-left transition-colors',
              activeThemeId === theme.id
                ? 'border-[var(--sidebar-active-border)] bg-[var(--sidebar-active-bg)] shadow-[var(--surface-shadow)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-base)] hover:border-[var(--border-default)] hover:bg-[var(--bg-overlay)]',
            )}
            key={theme.id}
            onClick={() => onSelectTheme(theme.id)}
            type="button"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {theme.label}
              </span>
              {activeThemeId === theme.id ? (
                <span className="rounded-full bg-[var(--sidebar-badge-bg)] px-2 py-0.5 text-[11px] text-[var(--accent-amber)]">
                  当前
                </span>
              ) : null}
            </div>
            <div className="mt-4 flex gap-2">
              <span
                className="h-3 w-3 rounded-full border border-black/10"
                style={{ backgroundColor: theme.ui['bg-base'] }}
              />
              <span
                className="h-3 w-3 rounded-full border border-black/10"
                style={{ backgroundColor: theme.ui['accent-amber'] }}
              />
              <span
                className="h-3 w-3 rounded-full border border-black/10"
                style={{ backgroundColor: theme.ui['accent-glow'] }}
              />
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function WorkspaceSection({
  activeProject,
  onOpenProject,
  projectCount,
  summary,
}: {
  activeProject: ProjectSummary | null
  onOpenProject: () => void
  projectCount: number
  summary: ReturnType<typeof summarizeProjectSnapshot>
}): ReactElement {
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(18rem,1fr)]">
      <SettingsCard
        description="当前打开的项目与文件快照。"
        title="工作区概览"
      >
        <dl className="grid gap-4 sm:grid-cols-2">
          <Metric label="当前项目" value={activeProject?.name ?? '未选择'} />
          <Metric label="已打开项目" value={`${projectCount}`} />
          <Metric label="文件数量" value={`${summary.totalFileCount}`} />
          <Metric label="改动文件" value={`${summary.changedFileCount}`} />
        </dl>
      </SettingsCard>
      <SettingsCard
        description="Flowterm 会把你最近进入的项目保持在手边。"
        title="项目入口"
      >
        <div className="space-y-3 text-sm leading-6 text-[var(--text-secondary)]">
          <p>
            当前终端状态：
            <span className="ml-2 text-[var(--text-primary)]">
              {formatTerminalState(activeProject?.terminalState)}
            </span>
          </p>
          <p>
            路径：
            <span className="ml-2 break-all text-[var(--text-primary)]">
              {activeProject?.path ?? '尚未打开项目'}
            </span>
          </p>
          <Button onClick={onOpenProject} variant="outline">
            打开项目
          </Button>
        </div>
      </SettingsCard>
    </section>
  )
}

function ShortcutsSection(): ReactElement {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <SettingsCard
        description="Flowterm 目前把常用操作集中在两个快捷动作。"
        title="全局快捷键"
      >
        <ShortcutRow description="打开命令面板" keys="⌘⇧P / Ctrl+Shift+P" />
        <ShortcutRow description="切换到下一个项目" keys="⌘→" />
        <ShortcutRow description="切换到上一个项目" keys="⌘←" />
      </SettingsCard>
      <SettingsCard
        description="当前没有复杂的快捷键编辑器，先保持入口清晰。"
        title="使用建议"
      >
        <ul className="space-y-3 text-sm leading-6 text-[var(--text-secondary)]">
          <li>命令面板适合切换主题、打开项目和跳转文件。</li>
          <li>最近项目切换更适合在多仓库并行工作时使用。</li>
          <li>设置页负责发现配置，命令面板负责快速执行。</li>
        </ul>
      </SettingsCard>
    </section>
  )
}

function AboutSection({
  projectCount,
  themeCount,
}: {
  projectCount: number
  themeCount: number
}): ReactElement {
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)]">
      <SettingsCard
        description="Flowterm 让文件树、代码变化和终端共享同一个工作台。"
        title="产品定位"
      >
        <p className="text-sm leading-7 text-[var(--text-secondary)]">
          这里不是传统的配置面板，而是一个温和、安静的入口。你可以从这里调整界面气质，
          也能快速理解当前工作区的状态，而不需要离开正在进行的编码场景。
        </p>
      </SettingsCard>
      <SettingsCard
        description="一些当前工作台的即时数字。"
        title="当前状态"
      >
        <dl className="space-y-3">
          <Metric label="主题数量" value={`${themeCount}`} />
          <Metric label="打开项目" value={`${projectCount}`} />
        </dl>
      </SettingsCard>
    </section>
  )
}

function SettingsCard({
  children,
  description,
  title,
}: {
  children: ReactElement | ReactElement[]
  description: string
  title: string
}): ReactElement {
  return (
    <section className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/90 p-5 shadow-[var(--surface-shadow)]">
      <div className="mb-5">
        <h3 className="text-base font-medium text-[var(--text-primary)]">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
      </div>
      {children}
    </section>
  )
}

function Metric({
  label,
  value,
}: {
  label: string
  value: string
}): ReactElement {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-4">
      <dt className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
        {value}
      </dd>
    </div>
  )
}

function ShortcutRow({
  description,
  keys,
}: {
  description: string
  keys: string
}): ReactElement {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] py-3 first:pt-0 last:border-b-0 last:pb-0">
      <span className="text-sm text-[var(--text-secondary)]">{description}</span>
      <kbd className="rounded-full border border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-1 font-mono text-xs text-[var(--text-primary)]">
        {keys}
      </kbd>
    </div>
  )
}

function TypographyField({
  description,
  label,
  onChange,
  step,
  value,
}: {
  description: string
  label: string
  onChange: (value: number) => void
  step: string
  value: number
}): ReactElement {
  return (
    <label className="block rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-4">
      <span className="block text-sm font-medium text-[var(--text-primary)]">{label}</span>
      <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">{description}</span>
      <Input
        aria-label={label}
        className="mt-3"
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="number"
        value={value}
      />
    </label>
  )
}

function formatTerminalState(state: TerminalState | undefined): string {
  switch (state) {
    case 'attention':
      return '需要关注'
    case 'exited':
      return '已退出'
    case 'running':
      return '运行中'
    case 'idle':
      return '空闲'
    default:
      return '未连接'
  }
}
