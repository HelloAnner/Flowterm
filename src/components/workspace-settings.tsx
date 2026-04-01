import {
  Bot,
  FolderOpen,
  Info,
  Keyboard,
  Palette,
  type LucideIcon,
} from 'lucide-react'
import { type ReactElement, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from './ui/button'
import { Input } from './ui/input'
import { listThemes } from '../features/theme/theme-registry'
import { summarizeProjectSnapshot } from '../features/workspace/tree'
import type { TerminalTypography } from '../features/workspace/terminal-preferences'
import {
  ACTION_GROUPS,
  ACTION_LABELS,
  ALL_SCOPES,
  DEFAULT_KEYBINDINGS,
  eventToCombo,
  formatBindings,
  SCOPE_COLORS,
  SCOPE_LABELS,
  type KeybindingAction,
  type KeybindingMap,
  type KeybindingScope,
  type KeyCombo,
} from '../features/workspace/keybindings'
import type { LlmConfig, ProjectFileEntry, ProjectSummary, TerminalState } from '../lib/contracts'
import { isTauriEnvironment, readLlmConfig, saveLlmConfig } from '../lib/tauri'
import { cn } from '../lib/utils'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type WorkspaceSettingsSection =
  | 'about'
  | 'appearance'
  | 'llm'
  | 'shortcuts'
  | 'workspace'

interface WorkspaceSettingsProps {
  activeProjectId: string | null
  activeThemeId: string
  files: ProjectFileEntry[]
  keybindings: KeybindingMap
  onOpenProject: () => void
  onSelectSection: (section: WorkspaceSettingsSection) => void
  onSelectTheme: (themeId: string) => void
  onSetKeybinding: (action: KeybindingAction, combos: KeyCombo[], scope?: KeybindingScope) => void
  onUpdateTerminalTypography: (value: Partial<TerminalTypography>) => void
  projects: ProjectSummary[]
  selectedSection: WorkspaceSettingsSection
  terminalTypography: TerminalTypography
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

interface NavItem {
  icon: LucideIcon
  id: WorkspaceSettingsSection
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { icon: Palette, id: 'appearance', label: '外观' },
  { icon: FolderOpen, id: 'workspace', label: '工作区' },
  { icon: Bot, id: 'llm', label: '大模型' },
  { icon: Keyboard, id: 'shortcuts', label: '快捷键' },
  { icon: Info, id: 'about', label: '关于' },
]

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function WorkspaceSettings({
  activeProjectId,
  activeThemeId,
  files,
  keybindings,
  onOpenProject,
  onSelectSection,
  onSelectTheme,
  onSetKeybinding,
  onUpdateTerminalTypography,
  projects,
  selectedSection,
  terminalTypography,
}: WorkspaceSettingsProps): ReactElement {
  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [activeProjectId, projects],
  )
  const summary = useMemo(() => summarizeProjectSnapshot(files), [files])
  const themes = useMemo(() => listThemes(), [])
  const themesByScheme = useMemo(
    () => ({
      dark: themes.filter((t) => t.colorScheme === 'dark'),
      light: themes.filter((t) => t.colorScheme === 'light'),
    }),
    [themes],
  )

  return (
    <div className="flex h-full min-h-0 bg-[var(--bg-base)]">
      {/* Navigation sidebar */}
      <nav className="flex w-[220px] shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
        <div className="flex h-11 items-center px-4">
          <span className="font-semibold text-[var(--text-primary)]">Settings</span>
        </div>
        <div className="flex flex-1 flex-col gap-0.5 px-2 py-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <button
                className={cn(
                  'settings-nav-item flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-left transition-all',
                  selectedSection === item.id
                    ? 'bg-[var(--rail-active-bg)] font-medium text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--rail-hover-bg)] hover:text-[var(--text-primary)]',
                )}
                key={item.id}
                onClick={() => onSelectSection(item.id)}
                type="button"
              >
                <Icon className={cn(
                  'h-4 w-4 shrink-0',
                  selectedSection === item.id ? 'text-[var(--accent-amber)]' : 'text-[var(--text-muted)]',
                )} />
                {item.label}
              </button>
            )
          })}
        </div>
      </nav>

      {/* Content — full-width scrollable column */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-10 py-7">
          <h1 className="mb-6 text-[var(--text-md)] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
            {NAV_ITEMS.find((n) => n.id === selectedSection)?.label ?? 'Settings'}
          </h1>

          {selectedSection === 'appearance' && (
            <AppearanceSection
              activeThemeId={activeThemeId}
              onSelectTheme={onSelectTheme}
              onUpdateTerminalTypography={onUpdateTerminalTypography}
              terminalTypography={terminalTypography}
              themesByScheme={themesByScheme}
            />
          )}
          {selectedSection === 'workspace' && (
            <WorkspaceSection
              activeProject={activeProject}
              onOpenProject={onOpenProject}
              projectCount={projects.length}
              summary={summary}
            />
          )}
          {selectedSection === 'llm' && <LlmSection />}
          {selectedSection === 'shortcuts' && (
            <ShortcutsSection keybindings={keybindings} onSetKeybinding={onSetKeybinding} />
          )}
          {selectedSection === 'about' && (
            <AboutSection projectCount={projects.length} themeCount={themes.length} />
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared primitives — all text inherits from body (--text-base: 13px)
// ---------------------------------------------------------------------------

function SettingsGroup({
  children,
  hint,
  title,
}: {
  children: ReactNode
  hint?: string
  title: string
}): ReactElement {
  return (
    <div className="settings-group mb-5 overflow-hidden rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
      <div className="flex items-center border-b border-[var(--border-subtle)] px-4 py-2">
        <span className="text-[var(--text-xs)] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
          {title}
        </span>
        {hint && (
          <>
            <span className="flex-1" />
            <span className="text-[var(--text-xs)] text-[var(--text-muted)]">{hint}</span>
          </>
        )}
      </div>
      <div className="divide-y divide-[var(--border-subtle)]">{children}</div>
    </div>
  )
}

function SettingsRow({
  children,
  description,
  label,
}: {
  children: ReactNode
  description?: string
  label: string
}): ReactElement {
  return (
    <div className="flex min-h-[44px] items-center gap-4 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[var(--text-primary)]">{label}</div>
        {description && (
          <div className="mt-0.5 text-[var(--text-xs)] text-[var(--text-muted)]">{description}</div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function SettingsRowFull({
  children,
  hint,
  label,
}: {
  children: ReactNode
  hint?: string
  label: string
}): ReactElement {
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center">
        <span className="text-[var(--text-primary)]">{label}</span>
        <span className="flex-1" />
        {hint && <span className="text-[var(--text-xs)] text-[var(--text-muted)]">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function NumberInput({
  max,
  min,
  onChange,
  step,
  value,
}: {
  max?: number
  min?: number
  onChange: (v: number) => void
  step: string
  value: number
}): ReactElement {
  return (
    <Input
      className="w-[72px] text-right font-mono"
      max={max}
      min={min}
      onChange={(e) => {
        const n = Number(e.target.value)
        if (!Number.isNaN(n)) onChange(n)
      }}
      step={step}
      type="number"
      value={value}
    />
  )
}

function DropdownControl({
  onSelect,
  options,
  value,
}: {
  onSelect: (v: string) => void
  options: { id: string; label: string }[]
  value: string
}): ReactElement {
  return (
    <select
      className="cursor-pointer rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2.5 py-1 font-medium text-[var(--text-primary)] focus:border-[var(--accent-amber)] focus:outline-none"
      onChange={(e) => onSelect(e.target.value)}
      value={value}
    >
      {options.map((opt) => (
        <option key={opt.id} value={opt.id}>{opt.label}</option>
      ))}
    </select>
  )
}

function Metric({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <SettingsRow label={label}>
      <span className="font-medium text-[var(--text-primary)]">{value}</span>
    </SettingsRow>
  )
}

// ---------------------------------------------------------------------------
// Appearance
// ---------------------------------------------------------------------------

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
  const allThemes = [...themesByScheme.dark, ...themesByScheme.light]
  const activeTheme = allThemes.find((t) => t.id === activeThemeId)

  return (
    <>
      <SettingsGroup title="界面主题">
        <SettingsRow label="配色方案">
          <DropdownControl
            onSelect={onSelectTheme}
            options={allThemes.map((t) => ({ id: t.id, label: t.label }))}
            value={activeThemeId}
          />
        </SettingsRow>
        <SettingsRow label="主题预览">
          <div className="flex items-center gap-2">
            {activeTheme && (
              <>
                <span className="h-5 w-5 rounded-full border border-[var(--border-subtle)]" style={{ backgroundColor: activeTheme.ui['bg-base'] }} />
                <span className="h-5 w-5 rounded-full border border-[var(--border-subtle)]" style={{ backgroundColor: activeTheme.ui['accent-amber'] }} />
                <span className="h-5 w-5 rounded-full border border-[var(--border-subtle)]" style={{ backgroundColor: activeTheme.ui['accent-glow'] }} />
                <span className="h-5 w-5 rounded-full border border-[var(--border-subtle)]" style={{ backgroundColor: activeTheme.ui['accent-sage'] }} />
                <span className="h-5 w-5 rounded-full border border-[var(--border-subtle)]" style={{ backgroundColor: activeTheme.ui['accent-clay'] }} />
              </>
            )}
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="终端排版">
        <SettingsRow description="推荐 11–14" label="终端字号">
          <NumberInput max={24} min={8} onChange={(v) => onUpdateTerminalTypography({ fontSize: v })} step="1" value={terminalTypography.fontSize} />
        </SettingsRow>
        <SettingsRow description="推荐 1.15–1.35" label="终端行高">
          <NumberInput max={2.5} min={1} onChange={(v) => onUpdateTerminalTypography({ lineHeight: v })} step="0.01" value={terminalTypography.lineHeight} />
        </SettingsRow>
        <SettingsRow description="负值更紧凑" label="字间距">
          <NumberInput max={5} min={-2} onChange={(v) => onUpdateTerminalTypography({ letterSpacing: v })} step="0.1" value={terminalTypography.letterSpacing} />
        </SettingsRow>
      </SettingsGroup>
    </>
  )
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

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
    <>
      <SettingsGroup title="工作区概览">
        <Metric label="当前项目" value={activeProject?.name ?? '未选择'} />
        <Metric label="已打开项目" value={`${projectCount}`} />
        <Metric label="文件数量" value={`${summary.totalFileCount}`} />
        <Metric label="改动文件" value={`${summary.changedFileCount}`} />
      </SettingsGroup>

      <SettingsGroup title="项目入口">
        <SettingsRow label="终端状态">
          <span className="text-[var(--text-primary)]">
            {formatTerminalState(activeProject?.terminalState)}
          </span>
        </SettingsRow>
        <SettingsRow label="项目路径">
          <span className="max-w-[400px] truncate font-mono text-[var(--text-secondary)]">
            {activeProject?.path ?? '—'}
          </span>
        </SettingsRow>
        <div className="px-4 py-3">
          <Button onClick={onOpenProject} variant="outline">打开项目</Button>
        </div>
      </SettingsGroup>
    </>
  )
}

// ---------------------------------------------------------------------------
// LLM
// ---------------------------------------------------------------------------

function LlmSection(): ReactElement {
  const [config, setConfig] = useState<LlmConfig>({
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    commitPrompt: '',
  })
  const [isSaved, setIsSaved] = useState(false)

  useEffect(() => {
    if (!isTauriEnvironment()) return
    void readLlmConfig().then(setConfig)
  }, [])

  const handleSave = useCallback(async () => {
    if (!isTauriEnvironment()) return
    await saveLlmConfig(config)
    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 2000)
  }, [config])

  return (
    <SettingsGroup hint="兼容 OpenAI API 格式" title="模型配置">
      <SettingsRow label="API Key">
        <Input
          className="w-[360px] font-mono"
          onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
          placeholder="sk-..."
          type="password"
          value={config.apiKey}
        />
      </SettingsRow>
      <SettingsRow label="Base URL">
        <Input
          className="w-[360px] font-mono"
          onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
          placeholder="https://api.deepseek.com"
          value={config.baseUrl}
        />
      </SettingsRow>
      <SettingsRow label="Model">
        <Input
          className="w-[360px]"
          onChange={(e) => setConfig({ ...config, model: e.target.value })}
          placeholder="deepseek-chat"
          value={config.model}
        />
      </SettingsRow>
      <SettingsRowFull hint="留空使用默认" label="Commit 提示词">
        <textarea
          className="min-h-[240px] w-full resize-y rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2.5 font-mono text-[var(--text-xs)] leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-amber)] focus:outline-none"
          onChange={(e) => setConfig({ ...config, commitPrompt: e.target.value })}
          placeholder="You are an expert Git commit message writer..."
          value={config.commitPrompt}
        />
      </SettingsRowFull>
      <div className="flex items-center justify-end px-4 py-3">
        <Button onClick={handleSave} variant={isSaved ? 'ghost' : 'outline'}>
          {isSaved ? '已保存 ✓' : '保存配置'}
        </Button>
      </div>
    </SettingsGroup>
  )
}

// ---------------------------------------------------------------------------
// Shortcuts
// ---------------------------------------------------------------------------

function ShortcutsSection({
  keybindings,
  onSetKeybinding,
}: {
  keybindings: KeybindingMap
  onSetKeybinding: (action: KeybindingAction, combos: KeyCombo[], scope?: KeybindingScope) => void
}): ReactElement {
  const [recordingAction, setRecordingAction] = useState<KeybindingAction | null>(null)

  return (
    <>
      {ACTION_GROUPS.map((group) => (
        <SettingsGroup key={group.id} title={group.label}>
          {group.actions.map((action) => {
            const entry = keybindings[action]
            return (
              <ShortcutRow
                action={action}
                combos={entry.combos}
                isRecording={recordingAction === action}
                key={action}
                label={ACTION_LABELS[action]}
                onCancel={() => setRecordingAction(null)}
                onChangeScope={(scope) => onSetKeybinding(action, entry.combos, scope)}
                onRecord={() => setRecordingAction(action)}
                onSave={(combos) => {
                  onSetKeybinding(action, combos)
                  setRecordingAction(null)
                }}
                scope={entry.scope}
              />
            )
          })}
        </SettingsGroup>
      ))}
    </>
  )
}

function ShortcutRow({
  action,
  combos,
  isRecording,
  label,
  onCancel,
  onChangeScope,
  onRecord,
  onSave,
  scope,
}: {
  action: KeybindingAction
  combos: KeyCombo[]
  isRecording: boolean
  label: string
  onCancel: () => void
  onChangeScope: (scope: KeybindingScope) => void
  onRecord: () => void
  onSave: (combos: KeyCombo[]) => void
  scope: KeybindingScope
}): ReactElement {
  useEffect(() => {
    if (!isRecording) return

    function handleKeyDown(event: KeyboardEvent): void {
      event.preventDefault()
      event.stopPropagation()

      if (event.key === 'Escape') {
        onCancel()
        return
      }
      if (event.key === 'Backspace') {
        onSave(DEFAULT_KEYBINDINGS[action].combos)
        return
      }

      const combo = eventToCombo(event)
      if (!combo) return
      onSave([combo])
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => { window.removeEventListener('keydown', handleKeyDown, true) }
  }, [action, isRecording, onCancel, onSave])

  const scopeColor = SCOPE_COLORS[scope]

  return (
    <div className="flex min-h-[44px] items-center gap-3 px-4 py-2.5">
      {/* Scope indicator dot */}
      <span
        className="h-[7px] w-[7px] shrink-0 rounded-full"
        style={{ backgroundColor: scopeColor }}
      />
      {/* Action label */}
      <span className="flex-1 text-[var(--text-primary)]">{label}</span>
      {/* Scope dropdown */}
      <select
        className="cursor-pointer rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2.5 py-1 text-[var(--text-xs)] font-medium focus:border-[var(--accent-amber)] focus:outline-none"
        onChange={(e) => onChangeScope(e.target.value as KeybindingScope)}
        style={{ color: scopeColor }}
        value={scope}
      >
        {ALL_SCOPES.map((s) => (
          <option key={s} value={s}>{SCOPE_LABELS[s]}</option>
        ))}
      </select>
      {/* Keybinding button */}
      <button
        className={cn(
          'rounded-md border px-3 py-1 font-mono text-[var(--text-xs)] transition-all',
          isRecording
            ? 'animate-pulse border-[var(--accent-amber)] bg-[var(--rail-active-bg)] text-[var(--accent-amber)]'
            : 'border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-primary)] hover:border-[var(--accent-amber)]',
        )}
        onClick={onRecord}
        type="button"
      >
        {isRecording ? '录制中…' : formatBindings(combos)}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// About
// ---------------------------------------------------------------------------

function AboutSection({
  projectCount,
  themeCount,
}: {
  projectCount: number
  themeCount: number
}): ReactElement {
  return (
    <>
      <SettingsGroup title="产品">
        <SettingsRow label="定位">
          <span className="text-[var(--text-secondary)]">终端优先的 Vibe Coding 工作台</span>
        </SettingsRow>
        <Metric label="主题数量" value={`${themeCount}`} />
        <Metric label="打开项目" value={`${projectCount}`} />
      </SettingsGroup>

      <SettingsGroup title="理念">
        <div className="px-4 py-3 leading-7 text-[var(--text-secondary)]">
          Flowterm 让文件树、代码变化和终端共享同一个工作台。这里不是传统的配置面板，
          而是一个温和、安静的入口——调整界面气质，理解工作区状态，不离开编码场景。
        </div>
      </SettingsGroup>
    </>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTerminalState(state: TerminalState | undefined): string {
  switch (state) {
    case 'attention': return '需要关注'
    case 'exited': return '已退出'
    case 'running': return '运行中'
    case 'idle': return '空闲'
    default: return '未连接'
  }
}
