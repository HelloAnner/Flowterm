// ---------------------------------------------------------------------------
// Keybinding system — configurable keyboard shortcuts with scope support
// ---------------------------------------------------------------------------

export type KeybindingScope = 'git' | 'global' | 'terminal' | 'tree'

export type KeybindingAction =
  | 'closeProject'
  | 'closeTerminal'
  | 'commandPalette'
  | 'gitAiCommit'
  | 'gitPullAll'
  | 'gitPush'
  | 'gitStash'
  | 'gitStashPop'
  | 'newProject'
  | 'newTerminal'
  | 'nextProject'
  | 'nextTerminal'
  | 'previousProject'
  | 'previousTerminal'

export interface KeyCombo {
  alt: boolean
  ctrl: boolean
  key: string // lowercase, e.g. 'arrowdown', 't', 'p'
  meta: boolean
  shift: boolean
}

export interface KeybindingEntry {
  combos: KeyCombo[]
  scope: KeybindingScope
}

export type KeybindingMap = Record<KeybindingAction, KeybindingEntry>

// Legacy format for migration
type LegacyKeybindingMap = Record<string, KeyCombo[]>

const STORAGE_KEY = 'flowterm.keybindings'

// ---------------------------------------------------------------------------
// Scope metadata
// ---------------------------------------------------------------------------

export const SCOPE_LABELS: Record<KeybindingScope, string> = {
  global: '全局',
  tree: '文件树',
  terminal: '终端',
  git: 'Git',
}

export const SCOPE_COLORS: Record<KeybindingScope, string> = {
  global: 'var(--accent-glow)',
  tree: 'var(--text-secondary)',
  terminal: 'var(--accent-sage)',
  git: 'var(--accent-amber)',
}

export const ALL_SCOPES: KeybindingScope[] = ['global', 'tree', 'terminal', 'git']

// ---------------------------------------------------------------------------
// Action groups (organized by function)
// ---------------------------------------------------------------------------

export type ActionGroup = 'git' | 'navigation' | 'terminal'

export interface ActionGroupDescriptor {
  actions: KeybindingAction[]
  id: ActionGroup
  label: string
}

export const ACTION_GROUPS: ActionGroupDescriptor[] = [
  {
    id: 'navigation',
    label: '导航',
    actions: [
      'commandPalette',
      'newProject',
      'closeProject',
      'nextProject',
      'previousProject',
    ],
  },
  {
    id: 'terminal',
    label: '终端',
    actions: [
      'newTerminal',
      'closeTerminal',
      'nextTerminal',
      'previousTerminal',
    ],
  },
  {
    id: 'git',
    label: 'Git 操作',
    actions: [
      'gitAiCommit',
      'gitPullAll',
      'gitPush',
      'gitStash',
      'gitStashPop',
    ],
  },
]

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

function combo(meta: boolean, ctrl: boolean, shift: boolean, alt: boolean, key: string): KeyCombo {
  return { alt, ctrl, key, meta, shift }
}

export const DEFAULT_KEYBINDINGS: KeybindingMap = {
  commandPalette: { scope: 'global', combos: [combo(true, false, true, false, 'p')] },
  newProject: {
    scope: 'global',
    combos: [combo(true, false, true, false, 'n'), combo(true, false, true, false, 't')],
  },
  closeProject: { scope: 'global', combos: [combo(true, false, true, false, 'w')] },
  nextProject: { scope: 'global', combos: [combo(true, false, false, false, 'arrowright')] },
  previousProject: { scope: 'global', combos: [combo(true, false, false, false, 'arrowleft')] },
  newTerminal: { scope: 'terminal', combos: [combo(true, false, false, false, 't')] },
  closeTerminal: { scope: 'global', combos: [combo(true, false, false, false, 'w')] },
  nextTerminal: { scope: 'terminal', combos: [combo(true, false, false, false, 'arrowdown')] },
  previousTerminal: { scope: 'terminal', combos: [combo(true, false, false, false, 'arrowup')] },
  gitAiCommit: { scope: 'git', combos: [combo(true, false, true, false, 'c')] },
  gitPullAll: { scope: 'git', combos: [combo(true, false, true, false, 'l')] },
  gitPush: { scope: 'global', combos: [combo(true, false, true, false, 'u')] },
  gitStash: { scope: 'git', combos: [combo(true, false, true, false, 's')] },
  gitStashPop: { scope: 'git', combos: [combo(true, false, true, true, 's')] },
}

export const ACTION_LABELS: Record<KeybindingAction, string> = {
  commandPalette: '打开命令面板',
  newProject: '添加项目',
  closeProject: '关闭当前项目',
  nextProject: '切换到下一个项目',
  previousProject: '切换到上一个项目',
  newTerminal: '新建终端',
  closeTerminal: '关闭当前终端',
  nextTerminal: '切换到下一个终端',
  previousTerminal: '切换到上一个终端',
  gitAiCommit: 'AI Commit',
  gitPullAll: 'Pull All',
  gitPush: 'Push',
  gitStash: 'Stash',
  gitStashPop: 'Stash Pop',
}

export const ALL_ACTIONS: KeybindingAction[] = ACTION_GROUPS.flatMap((g) => g.actions)

// ---------------------------------------------------------------------------
// Match a keyboard event against a combo
// ---------------------------------------------------------------------------

export function matchesCombo(event: KeyboardEvent, c: KeyCombo): boolean {
  return (
    event.metaKey === c.meta &&
    event.ctrlKey === c.ctrl &&
    event.shiftKey === c.shift &&
    event.altKey === c.alt &&
    event.key.toLowerCase() === c.key
  )
}

export function matchesAction(
  event: KeyboardEvent,
  bindings: KeybindingMap,
  action: KeybindingAction,
): boolean {
  return bindings[action].combos.some((c) => matchesCombo(event, c))
}

export function matchesActionInScope(
  event: KeyboardEvent,
  bindings: KeybindingMap,
  action: KeybindingAction,
  activeScope: KeybindingScope,
): boolean {
  const entry = bindings[action]
  if (entry.scope !== 'global' && entry.scope !== activeScope) return false
  return entry.combos.some((c) => matchesCombo(event, c))
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const KEY_SYMBOLS: Record<string, string> = {
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  arrowup: '↑',
  backspace: '⌫',
  delete: '⌦',
  enter: '↩',
  escape: 'Esc',
  space: '␣',
  tab: '⇥',
}

export function formatCombo(c: KeyCombo): string {
  const parts: string[] = []
  if (c.ctrl) parts.push('Ctrl')
  if (c.meta) parts.push('⌘')
  if (c.alt) parts.push('⌥')
  if (c.shift) parts.push('⇧')
  parts.push(KEY_SYMBOLS[c.key] ?? c.key.toUpperCase())
  return parts.join('')
}

export function formatBindings(combos: KeyCombo[]): string {
  return combos.map(formatCombo).join(' / ')
}

// ---------------------------------------------------------------------------
// Parse a KeyboardEvent into a KeyCombo
// ---------------------------------------------------------------------------

const MODIFIER_KEYS = new Set(['Meta', 'Control', 'Alt', 'Shift'])

export function eventToCombo(event: KeyboardEvent): KeyCombo | null {
  if (MODIFIER_KEYS.has(event.key)) return null
  return {
    alt: event.altKey,
    ctrl: event.ctrlKey,
    key: event.key.toLowerCase(),
    meta: event.metaKey,
    shift: event.shiftKey,
  }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export function readStoredKeybindings(): KeybindingMap {
  if (typeof window === 'undefined') return DEFAULT_KEYBINDINGS

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return DEFAULT_KEYBINDINGS

  try {
    const parsed = JSON.parse(raw)
    // Detect legacy format (array values instead of entry objects)
    const firstKey = Object.keys(parsed)[0]
    if (firstKey && Array.isArray(parsed[firstKey])) {
      return migrateLegacy(parsed as LegacyKeybindingMap)
    }
    return mergeWithDefaults(parsed as Partial<KeybindingMap>)
  } catch {
    return DEFAULT_KEYBINDINGS
  }
}

export function storeKeybindings(bindings: KeybindingMap): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings))
}

function migrateLegacy(legacy: LegacyKeybindingMap): KeybindingMap {
  const result = { ...DEFAULT_KEYBINDINGS }
  for (const action of ALL_ACTIONS) {
    if (legacy[action] && Array.isArray(legacy[action]) && legacy[action].length > 0) {
      result[action] = { ...result[action], combos: legacy[action] }
    }
  }
  return result
}

function mergeWithDefaults(partial: Partial<KeybindingMap>): KeybindingMap {
  const result = { ...DEFAULT_KEYBINDINGS }
  for (const action of ALL_ACTIONS) {
    const entry = partial[action]
    if (entry && Array.isArray(entry.combos) && entry.combos.length > 0) {
      result[action] = {
        scope: ALL_SCOPES.includes(entry.scope) ? entry.scope : DEFAULT_KEYBINDINGS[action].scope,
        combos: entry.combos,
      }
    }
  }
  return result
}
