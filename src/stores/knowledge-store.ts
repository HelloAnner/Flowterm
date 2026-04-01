import { create } from 'zustand'

import type {
  CardFilters,
  CardRelation,
  CardStatus,
  CardType,
  KnowledgeCard,
  KnowledgeViewMode,
  RelationType,
  Severity,
} from '../lib/contracts'

const STORAGE_KEY = 'flowterm-knowledge-cards'
const RELATIONS_STORAGE_KEY = 'flowterm-knowledge-relations'

interface CreateCardInput {
  type: CardType
  title: string
  summary: string
  projectId: string
  filePath?: string
  tags?: string[]
  severity?: Severity
  sourceText?: string
}

interface KnowledgeState {
  cards: KnowledgeCard[]
  relations: CardRelation[]
  viewMode: KnowledgeViewMode
  selectedCardId: string | null
  isDetailOpen: boolean
  filters: CardFilters

  // Actions
  createCard: (input: CreateCardInput) => KnowledgeCard
  updateCard: (id: string, updates: Partial<Pick<KnowledgeCard, 'filePath' | 'severity' | 'sourceText' | 'status' | 'summary' | 'tags' | 'title' | 'type'>>) => void
  deleteCard: (id: string) => void
  createRelation: (sourceCardId: string, targetCardId: string, type: RelationType, description?: string) => void
  deleteRelation: (id: string) => void
  setViewMode: (mode: KnowledgeViewMode) => void
  selectCard: (id: string | null) => void
  setFilters: (filters: Partial<CardFilters>) => void
  resetFilters: () => void
  hydrateFromStorage: () => void
}

function generateId(): string {
  return `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function persistCards(cards: KnowledgeCard[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards))
  } catch {
    // Storage full or unavailable — silently degrade
  }
}

function persistRelations(relations: CardRelation[]): void {
  try {
    localStorage.setItem(RELATIONS_STORAGE_KEY, JSON.stringify(relations))
  } catch {
    // Silent
  }
}

function readStoredCards(): KnowledgeCard[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as KnowledgeCard[]) : []
  } catch {
    return []
  }
}

function readStoredRelations(): CardRelation[] {
  try {
    const raw = localStorage.getItem(RELATIONS_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CardRelation[]) : []
  } catch {
    return []
  }
}

const EMPTY_FILTERS: CardFilters = {
  types: [],
  tags: [],
  statuses: [],
  searchQuery: '',
}

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  cards: [],
  relations: [],
  viewMode: 'kanban',
  selectedCardId: null,
  isDetailOpen: false,
  filters: { ...EMPTY_FILTERS },

  createCard: (input) => {
    const now = Date.now()
    const card: KnowledgeCard = {
      id: generateId(),
      type: input.type,
      title: input.title,
      summary: input.summary,
      projectId: input.projectId,
      filePath: input.filePath,
      tags: input.tags ?? [],
      status: 'open',
      severity: input.severity,
      sourceText: input.sourceText,
      createdAt: now,
      updatedAt: now,
    }

    const nextCards = [card, ...get().cards]
    persistCards(nextCards)
    set({ cards: nextCards })
    return card
  },

  updateCard: (id, updates) => {
    const nextCards = get().cards.map((card) =>
      card.id === id
        ? { ...card, ...updates, updatedAt: Date.now() }
        : card,
    )
    persistCards(nextCards)
    set({ cards: nextCards })
  },

  deleteCard: (id) => {
    const nextCards = get().cards.filter((card) => card.id !== id)
    const nextRelations = get().relations.filter(
      (rel) => rel.sourceCardId !== id && rel.targetCardId !== id,
    )
    persistCards(nextCards)
    persistRelations(nextRelations)
    set({
      cards: nextCards,
      relations: nextRelations,
      selectedCardId: get().selectedCardId === id ? null : get().selectedCardId,
      isDetailOpen: get().selectedCardId === id ? false : get().isDetailOpen,
    })
  },

  createRelation: (sourceCardId, targetCardId, type, description) => {
    const relation: CardRelation = {
      id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sourceCardId,
      targetCardId,
      type,
      description,
      createdAt: Date.now(),
    }
    const nextRelations = [...get().relations, relation]
    persistRelations(nextRelations)
    set({ relations: nextRelations })
  },

  deleteRelation: (id) => {
    const nextRelations = get().relations.filter((rel) => rel.id !== id)
    persistRelations(nextRelations)
    set({ relations: nextRelations })
  },

  setViewMode: (mode) => set({ viewMode: mode }),

  selectCard: (id) =>
    set({
      selectedCardId: id,
      isDetailOpen: id !== null,
    }),

  setFilters: (partial) =>
    set((state) => ({
      filters: { ...state.filters, ...partial },
    })),

  resetFilters: () => set({ filters: { ...EMPTY_FILTERS } }),

  hydrateFromStorage: () => {
    set({
      cards: readStoredCards(),
      relations: readStoredRelations(),
    })
  },
}))

// ---------------------------------------------------------------------------
// Derived selectors
// ---------------------------------------------------------------------------

export function filterCards(
  cards: KnowledgeCard[],
  projectId: string | null,
  filters: CardFilters,
): KnowledgeCard[] {
  let result = projectId
    ? cards.filter((card) => card.projectId === projectId)
    : cards

  if (filters.types.length > 0) {
    result = result.filter((card) => filters.types.includes(card.type))
  }

  if (filters.statuses.length > 0) {
    result = result.filter((card) => filters.statuses.includes(card.status))
  }

  if (filters.tags.length > 0) {
    result = result.filter((card) =>
      filters.tags.some((tag) => card.tags.includes(tag)),
    )
  }

  if (filters.searchQuery.trim()) {
    const query = filters.searchQuery.toLowerCase()
    result = result.filter(
      (card) =>
        card.title.toLowerCase().includes(query) ||
        card.summary.toLowerCase().includes(query) ||
        card.tags.some((tag) => tag.toLowerCase().includes(query)),
    )
  }

  return result
}

export function groupCardsByType(
  cards: KnowledgeCard[],
): Record<CardType, KnowledgeCard[]> {
  const groups: Record<CardType, KnowledgeCard[]> = {
    bug: [],
    pitfall: [],
    decision: [],
    insight: [],
    task: [],
  }

  for (const card of cards) {
    groups[card.type].push(card)
  }

  return groups
}

export function collectAllTags(cards: KnowledgeCard[]): string[] {
  const tagSet = new Set<string>()
  for (const card of cards) {
    for (const tag of card.tags) {
      tagSet.add(tag)
    }
  }
  return [...tagSet].sort()
}

export const CARD_TYPE_META: Record<
  CardType,
  { label: string; kanbanLabel: string; color: string }
> = {
  bug: { label: 'Bug', kanbanLabel: 'Bugs', color: 'var(--accent-clay)' },
  pitfall: { label: '坑点', kanbanLabel: '坑点', color: 'var(--accent-amber)' },
  decision: { label: '架构决策', kanbanLabel: '架构决策', color: 'var(--accent-glow)' },
  insight: { label: '洞察', kanbanLabel: '洞察', color: 'var(--accent-sage)' },
  task: { label: '任务', kanbanLabel: '任务', color: 'var(--text-secondary)' },
}

export const CARD_STATUS_META: Record<CardStatus, { label: string }> = {
  open: { label: '待处理' },
  'in-progress': { label: '进行中' },
  resolved: { label: '已解决' },
  closed: { label: '已关闭' },
}
