import {
  Bug,
  Calendar,
  ChevronDown,
  ChevronRight,
  Filter,
  Lightbulb,
  type LucideIcon,
  Plus,
  Ruler,
  Search,
  Sparkles,
  SquareCheckBig,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import {
  memo,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { ScrollArea } from './ui/scroll-area'
import type {
  CardStatus,
  CardType,
  KnowledgeCard,
  KnowledgeViewMode,
} from '../lib/contracts'
import {
  CARD_STATUS_META,
  CARD_TYPE_META,
  collectAllTags,
  filterCards,
  groupCardsByType,
  useKnowledgeStore,
} from '../stores/knowledge-store'
import { cn } from '../lib/utils'

// ---------------------------------------------------------------------------
// Card type visuals
// ---------------------------------------------------------------------------

const CARD_TYPE_ICONS: Record<CardType, LucideIcon> = {
  bug: Bug,
  pitfall: Zap,
  decision: Ruler,
  insight: Lightbulb,
  task: SquareCheckBig,
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface KnowledgeBoardProps {
  projectId: string | null
}

export const KnowledgeBoard = memo(function KnowledgeBoard({
  projectId,
}: KnowledgeBoardProps): ReactElement {
  const cards = useKnowledgeStore((s) => s.cards)
  const filters = useKnowledgeStore((s) => s.filters)
  const viewMode = useKnowledgeStore((s) => s.viewMode)
  const selectedCardId = useKnowledgeStore((s) => s.selectedCardId)
  const isDetailOpen = useKnowledgeStore((s) => s.isDetailOpen)
  const setViewMode = useKnowledgeStore((s) => s.setViewMode)
  const setFilters = useKnowledgeStore((s) => s.setFilters)
  const selectCard = useKnowledgeStore((s) => s.selectCard)
  const createCard = useKnowledgeStore((s) => s.createCard)
  const updateCard = useKnowledgeStore((s) => s.updateCard)
  const deleteCard = useKnowledgeStore((s) => s.deleteCard)
  const hydrateFromStorage = useKnowledgeStore((s) => s.hydrateFromStorage)

  const [isCreating, setIsCreating] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)

  useEffect(() => {
    hydrateFromStorage()
  }, [hydrateFromStorage])

  const filteredCards = useMemo(
    () => filterCards(cards, projectId, filters),
    [cards, projectId, filters],
  )
  const allTags = useMemo(() => collectAllTags(cards), [cards])
  const selectedCard = useMemo(
    () => (selectedCardId ? cards.find((c) => c.id === selectedCardId) ?? null : null),
    [cards, selectedCardId],
  )
  const projectCardCount = useMemo(
    () => (projectId ? cards.filter((c) => c.projectId === projectId).length : cards.length),
    [cards, projectId],
  )

  const handleCreateCard = useCallback(
    (type: CardType, title: string, summary: string, tags: string[]) => {
      if (!projectId) return
      createCard({ type, title, summary, projectId, tags })
      setIsCreating(false)
    },
    [createCard, projectId],
  )

  return (
    <div className="flex h-full min-h-0 bg-[var(--bg-base)]">
      {/* Filter sidebar — collapsible */}
      {isFilterOpen ? (
        <FilterSidebar
          allTags={allTags}
          filters={filters}
          onClose={() => setIsFilterOpen(false)}
          onSetFilters={setFilters}
        />
      ) : null}

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-3">
          <button
            aria-label="筛选器"
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]',
              isFilterOpen && 'bg-[var(--bg-overlay)] text-[var(--text-primary)]',
            )}
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            type="button"
          >
            <Filter className="h-3.5 w-3.5" />
          </button>
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              className="h-7 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] pl-7 pr-2 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-amber)]"
              onChange={(e) => setFilters({ searchQuery: e.target.value })}
              placeholder="搜索知识卡片..."
              value={filters.searchQuery}
            />
          </div>
          <ViewSwitcher activeView={viewMode} onSwitch={setViewMode} />
          <button
            className="flex h-7 items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-amber)] hover:text-[var(--text-primary)]"
            onClick={() => setIsCreating(true)}
            type="button"
          >
            <Plus className="h-3 w-3" />
            <span>新建</span>
          </button>
        </div>

        {/* View area */}
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1">
            {filteredCards.length === 0 && !isCreating ? (
              <EmptyBoard
                hasFilters={
                  filters.types.length > 0 ||
                  filters.statuses.length > 0 ||
                  filters.tags.length > 0 ||
                  filters.searchQuery.length > 0
                }
                onCreateFirst={() => setIsCreating(true)}
              />
            ) : viewMode === 'kanban' ? (
              <KanbanView
                cards={filteredCards}
                onDeleteCard={deleteCard}
                onSelectCard={selectCard}
                selectedCardId={selectedCardId}
              />
            ) : (
              <TimelineView
                cards={filteredCards}
                onSelectCard={selectCard}
                selectedCardId={selectedCardId}
              />
            )}
          </div>

          {/* Detail panel */}
          {isDetailOpen && selectedCard ? (
            <CardDetailPanel
              card={selectedCard}
              key={selectedCard.id}
              onClose={() => selectCard(null)}
              onDelete={() => deleteCard(selectedCard.id)}
              onUpdate={(updates) => updateCard(selectedCard.id, updates)}
            />
          ) : null}
        </div>

        {/* Status bar */}
        <div className="flex h-7 shrink-0 items-center justify-between border-t border-[var(--border-subtle)] px-3">
          <span className="text-[11px] text-[var(--text-muted)]">
            {projectCardCount} 张卡片
            {filteredCards.length !== projectCardCount
              ? ` · 显示 ${filteredCards.length}`
              : ''}
          </span>
        </div>
      </div>

      {/* Create card dialog */}
      {isCreating ? (
        <CreateCardDialog
          onClose={() => setIsCreating(false)}
          onCreate={handleCreateCard}
        />
      ) : null}
    </div>
  )
})

// ---------------------------------------------------------------------------
// View switcher
// ---------------------------------------------------------------------------

function ViewSwitcher({
  activeView,
  onSwitch,
}: {
  activeView: KnowledgeViewMode
  onSwitch: (view: KnowledgeViewMode) => void
}): ReactElement {
  const views: { id: KnowledgeViewMode; label: string }[] = [
    { id: 'kanban', label: '看板' },
    { id: 'timeline', label: '时间线' },
  ]

  return (
    <div className="flex items-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
      {views.map((view) => (
        <button
          className={cn(
            'px-2.5 py-1 text-[11px] transition-colors',
            activeView === view.id
              ? 'bg-[var(--bg-overlay)] text-[var(--text-primary)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
            view.id === 'kanban' && 'rounded-l-[5px]',
            view.id === 'timeline' && 'rounded-r-[5px]',
          )}
          key={view.id}
          onClick={() => onSwitch(view.id)}
          type="button"
        >
          {view.label}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Filter sidebar
// ---------------------------------------------------------------------------

function FilterSidebar({
  allTags,
  filters,
  onClose,
  onSetFilters,
}: {
  allTags: string[]
  filters: import('../lib/contracts').CardFilters
  onClose: () => void
  onSetFilters: (f: Partial<import('../lib/contracts').CardFilters>) => void
}): ReactElement {
  const typeEntries = Object.entries(CARD_TYPE_META) as [CardType, typeof CARD_TYPE_META[CardType]][]
  const statusEntries = Object.entries(CARD_STATUS_META) as [CardStatus, typeof CARD_STATUS_META[CardStatus]][]

  const toggleType = (type: CardType) => {
    const next = filters.types.includes(type)
      ? filters.types.filter((t) => t !== type)
      : [...filters.types, type]
    onSetFilters({ types: next })
  }

  const toggleStatus = (status: CardStatus) => {
    const next = filters.statuses.includes(status)
      ? filters.statuses.filter((s) => s !== status)
      : [...filters.statuses, status]
    onSetFilters({ statuses: next })
  }

  const toggleTag = (tag: string) => {
    const next = filters.tags.includes(tag)
      ? filters.tags.filter((t) => t !== tag)
      : [...filters.tags, tag]
    onSetFilters({ tags: next })
  }

  return (
    <div className="flex w-48 shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-elevated)]/80">
      <div className="flex h-10 items-center justify-between border-b border-[var(--border-subtle)] px-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
          筛选器
        </span>
        <button
          className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          onClick={onClose}
          type="button"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-3">
          <FilterGroup title="类型">
            {typeEntries.map(([type, meta]) => {
              const Icon = CARD_TYPE_ICONS[type]
              return (
                <FilterCheckbox
                  checked={filters.types.includes(type)}
                  icon={<Icon className="h-3 w-3" style={{ color: meta.color }} />}
                  key={type}
                  label={meta.label}
                  onChange={() => toggleType(type)}
                />
              )
            })}
          </FilterGroup>
          <FilterGroup title="状态">
            {statusEntries.map(([status, meta]) => (
              <FilterCheckbox
                checked={filters.statuses.includes(status)}
                key={status}
                label={meta.label}
                onChange={() => toggleStatus(status)}
              />
            ))}
          </FilterGroup>
          {allTags.length > 0 ? (
            <FilterGroup title="标签">
              {allTags.map((tag) => (
                <FilterCheckbox
                  checked={filters.tags.includes(tag)}
                  key={tag}
                  label={tag}
                  onChange={() => toggleTag(tag)}
                />
              ))}
            </FilterGroup>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}

function FilterGroup({
  children,
  title,
}: {
  children: ReactElement | ReactElement[]
  title: string
}): ReactElement {
  const [isOpen, setIsOpen] = useState(true)

  return (
    <div>
      <button
        className="mb-1.5 flex w-full items-center gap-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        {isOpen ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {title}
      </button>
      {isOpen ? <div className="space-y-0.5 pl-1">{children}</div> : null}
    </div>
  )
}

function FilterCheckbox({
  checked,
  icon,
  label,
  onChange,
}: {
  checked: boolean
  icon?: ReactElement
  label: string
  onChange: () => void
}): ReactElement {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-overlay)]">
      <input
        checked={checked}
        className="h-3 w-3 rounded border-[var(--border-default)] accent-[var(--accent-amber)]"
        onChange={onChange}
        type="checkbox"
      />
      {icon ?? null}
      <span className="truncate">{label}</span>
    </label>
  )
}

// ---------------------------------------------------------------------------
// Kanban view
// ---------------------------------------------------------------------------

function KanbanView({
  cards,
  onDeleteCard,
  onSelectCard,
  selectedCardId,
}: {
  cards: KnowledgeCard[]
  onDeleteCard: (id: string) => void
  onSelectCard: (id: string | null) => void
  selectedCardId: string | null
}): ReactElement {
  const grouped = useMemo(() => groupCardsByType(cards), [cards])
  const columns = (['bug', 'pitfall', 'decision', 'insight', 'task'] as const).filter(
    (type) => grouped[type].length > 0,
  )

  // If all columns are empty (shouldn't happen because parent checks), show all
  const visibleColumns = columns.length > 0 ? columns : (['bug', 'pitfall', 'decision', 'insight', 'task'] as const)

  return (
    <ScrollArea className="h-full">
      <div className="flex min-h-full gap-3 p-3">
        {visibleColumns.map((type) => {
          const meta = CARD_TYPE_META[type]
          const Icon = CARD_TYPE_ICONS[type]
          const columnCards = grouped[type]

          return (
            <div
              className="flex w-64 shrink-0 flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60"
              key={type}
            >
              <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2.5">
                <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
                <span className="text-[12px] font-medium text-[var(--text-primary)]">
                  {meta.kanbanLabel}
                </span>
                <span className="ml-auto text-[11px] text-[var(--text-muted)]">
                  {columnCards.length}
                </span>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-2 p-2">
                  {columnCards.length === 0 ? (
                    <p className="px-2 py-6 text-center text-[11px] text-[var(--text-muted)]">
                      暂无卡片
                    </p>
                  ) : (
                    columnCards.map((card) => (
                      <CardTile
                        card={card}
                        isSelected={card.id === selectedCardId}
                        key={card.id}
                        onDelete={() => onDeleteCard(card.id)}
                        onSelect={() => onSelectCard(card.id)}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}

// ---------------------------------------------------------------------------
// Timeline view
// ---------------------------------------------------------------------------

function TimelineView({
  cards,
  onSelectCard,
  selectedCardId,
}: {
  cards: KnowledgeCard[]
  onSelectCard: (id: string | null) => void
  selectedCardId: string | null
}): ReactElement {
  const sortedCards = useMemo(
    () => [...cards].sort((a, b) => b.createdAt - a.createdAt),
    [cards],
  )

  const groupedByDate = useMemo(() => {
    const groups: { date: string; cards: KnowledgeCard[] }[] = []
    let currentDate = ''

    for (const card of sortedCards) {
      const dateStr = new Date(card.createdAt).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })

      if (dateStr !== currentDate) {
        currentDate = dateStr
        groups.push({ date: dateStr, cards: [card] })
      } else {
        groups[groups.length - 1].cards.push(card)
      }
    }

    return groups
  }, [sortedCards])

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-2xl px-6 py-4">
        {groupedByDate.map((group) => (
          <div className="relative" key={group.date}>
            {/* Date header */}
            <div className="sticky top-0 z-10 mb-3 flex items-center gap-2 bg-[var(--bg-base)] py-2">
              <Calendar className="h-3 w-3 text-[var(--text-muted)]" />
              <span className="text-[12px] font-medium text-[var(--text-secondary)]">
                {group.date}
              </span>
              <div className="h-px flex-1 bg-[var(--border-subtle)]" />
            </div>
            {/* Timeline track */}
            <div className="relative ml-4 border-l border-[var(--border-subtle)] pb-4 pl-5">
              {group.cards.map((card) => {
                const meta = CARD_TYPE_META[card.type]
                const Icon = CARD_TYPE_ICONS[card.type]

                return (
                  <button
                    className={cn(
                      'group relative mb-2.5 w-full rounded-xl border p-3 text-left transition-all',
                      card.id === selectedCardId
                        ? 'border-[var(--accent-amber)] bg-[var(--sidebar-active-bg)] shadow-[var(--surface-shadow)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)]',
                    )}
                    key={card.id}
                    onClick={() => onSelectCard(card.id)}
                    type="button"
                  >
                    {/* Timeline dot */}
                    <span
                      className="absolute -left-[29px] top-4 h-2 w-2 rounded-full border-2 border-[var(--bg-base)]"
                      style={{ backgroundColor: meta.color }}
                    />
                    <div className="flex items-start gap-2">
                      <Icon
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        style={{ color: meta.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-[var(--text-primary)]">
                          {card.title}
                        </p>
                        <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
                          {card.summary}
                        </p>
                        {card.tags.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {card.tags.map((tag) => (
                              <span
                                className="rounded-full bg-[var(--bg-overlay)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]"
                                key={tag}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
                        {formatTime(card.createdAt)}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

// ---------------------------------------------------------------------------
// Card tile (kanban)
// ---------------------------------------------------------------------------

function CardTile({
  card,
  isSelected,
  onDelete,
  onSelect,
}: {
  card: KnowledgeCard
  isSelected: boolean
  onDelete: () => void
  onSelect: () => void
}): ReactElement {
  const statusMeta = CARD_STATUS_META[card.status]

  return (
    <button
      className={cn(
        'group w-full rounded-lg border p-2.5 text-left transition-all',
        isSelected
          ? 'border-[var(--accent-amber)] bg-[var(--sidebar-active-bg)] shadow-[var(--surface-shadow)]'
          : 'border-[var(--border-subtle)] bg-[var(--bg-base)] hover:border-[var(--border-default)]',
      )}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-start justify-between gap-1">
        <p className="text-[12px] font-medium leading-5 text-[var(--text-primary)]">
          {card.title}
        </p>
        <button
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          type="button"
        >
          <Trash2 className="h-3 w-3 text-[var(--accent-clay)]" />
        </button>
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--text-muted)]">
        {card.summary}
      </p>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {card.tags.slice(0, 2).map((tag) => (
            <span
              className="rounded-full bg-[var(--bg-overlay)] px-1.5 py-0.5 text-[9px] text-[var(--text-muted)]"
              key={tag}
            >
              {tag}
            </span>
          ))}
          {card.tags.length > 2 ? (
            <span className="text-[9px] text-[var(--text-muted)]">
              +{card.tags.length - 2}
            </span>
          ) : null}
        </div>
        <span className="text-[9px] text-[var(--text-muted)]">
          {statusMeta.label}
        </span>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Card detail panel
// ---------------------------------------------------------------------------

function CardDetailPanel({
  card,
  onClose,
  onDelete,
  onUpdate,
}: {
  card: KnowledgeCard
  onClose: () => void
  onDelete: () => void
  onUpdate: (updates: Partial<Pick<KnowledgeCard, 'status' | 'summary' | 'tags' | 'title'>>) => void
}): ReactElement {
  const meta = CARD_TYPE_META[card.type]
  const Icon = CARD_TYPE_ICONS[card.type]
  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState(card.title)
  const [editingSummary, setEditingSummary] = useState(false)
  const [draftSummary, setDraftSummary] = useState(card.summary)
  const titleRef = useRef<HTMLInputElement | null>(null)
  const summaryRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (editingTitle) titleRef.current?.focus()
  }, [editingTitle])

  useEffect(() => {
    if (editingSummary) summaryRef.current?.focus()
  }, [editingSummary])

  const commitTitle = () => {
    const trimmed = draftTitle.trim()
    if (trimmed && trimmed !== card.title) {
      onUpdate({ title: trimmed })
    } else {
      setDraftTitle(card.title)
    }
    setEditingTitle(false)
  }

  const commitSummary = () => {
    const trimmed = draftSummary.trim()
    if (trimmed !== card.summary) {
      onUpdate({ summary: trimmed })
    } else {
      setDraftSummary(card.summary)
    }
    setEditingSummary(false)
  }

  const allStatuses: CardStatus[] = ['open', 'in-progress', 'resolved', 'closed']

  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-elevated)]/80">
      <div className="flex h-10 items-center justify-between border-b border-[var(--border-subtle)] px-3">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
          <span className="text-[11px] font-medium text-[var(--text-secondary)]">
            {meta.label}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--accent-clay)]"
            onClick={onDelete}
            title="删除卡片"
            type="button"
          >
            <Trash2 className="h-3 w-3" />
          </button>
          <button
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            onClick={onClose}
            type="button"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          {/* Title */}
          {editingTitle ? (
            <input
              className="w-full rounded border border-[var(--accent-amber)] bg-[var(--bg-base)] px-2 py-1 text-[14px] font-medium text-[var(--text-primary)] outline-none"
              onBlur={commitTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTitle()
                if (e.key === 'Escape') {
                  setDraftTitle(card.title)
                  setEditingTitle(false)
                }
              }}
              ref={titleRef}
              value={draftTitle}
            />
          ) : (
            <h3
              className="cursor-pointer text-[14px] font-medium text-[var(--text-primary)] hover:text-[var(--accent-amber)]"
              onClick={() => setEditingTitle(true)}
            >
              {card.title}
            </h3>
          )}

          {/* Status */}
          <div>
            <p className="mb-1.5 text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
              状态
            </p>
            <div className="flex flex-wrap gap-1.5">
              {allStatuses.map((status) => (
                <button
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                    card.status === status
                      ? 'border-[var(--accent-amber)] bg-[var(--sidebar-active-bg)] text-[var(--text-primary)]'
                      : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-default)] hover:text-[var(--text-secondary)]',
                  )}
                  key={status}
                  onClick={() => onUpdate({ status })}
                  type="button"
                >
                  {CARD_STATUS_META[status].label}
                </button>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div>
            <p className="mb-1.5 text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
              摘要
            </p>
            {editingSummary ? (
              <textarea
                className="w-full resize-none rounded border border-[var(--accent-amber)] bg-[var(--bg-base)] px-2 py-1.5 text-[12px] leading-5 text-[var(--text-primary)] outline-none"
                onBlur={commitSummary}
                onChange={(e) => setDraftSummary(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setDraftSummary(card.summary)
                    setEditingSummary(false)
                  }
                }}
                ref={summaryRef}
                rows={4}
                value={draftSummary}
              />
            ) : (
              <p
                className="cursor-pointer text-[12px] leading-5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                onClick={() => setEditingSummary(true)}
              >
                {card.summary || '点击添加摘要...'}
              </p>
            )}
          </div>

          {/* Tags */}
          <div>
            <p className="mb-1.5 text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
              标签
            </p>
            <TagEditor
              onChange={(tags) => onUpdate({ tags })}
              tags={card.tags}
            />
          </div>

          {/* File path */}
          {card.filePath ? (
            <div>
              <p className="mb-1.5 text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                关联文件
              </p>
              <p className="break-all text-[12px] text-[var(--text-secondary)]">
                {card.filePath}
              </p>
            </div>
          ) : null}

          {/* Timestamps */}
          <div className="border-t border-[var(--border-subtle)] pt-3">
            <p className="text-[11px] text-[var(--text-muted)]">
              创建于 {new Date(card.createdAt).toLocaleString('zh-CN')}
            </p>
            {card.updatedAt !== card.createdAt ? (
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                更新于 {new Date(card.updatedAt).toLocaleString('zh-CN')}
              </p>
            ) : null}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tag editor
// ---------------------------------------------------------------------------

function TagEditor({
  onChange,
  tags,
}: {
  onChange: (tags: string[]) => void
  tags: string[]
}): ReactElement {
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  const addTag = () => {
    const trimmed = draft.trim()
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed])
    }
    setDraft('')
  }

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag))
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <span
            className="group flex items-center gap-1 rounded-full bg-[var(--bg-overlay)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]"
            key={tag}
          >
            {tag}
            <button
              className="opacity-0 transition-opacity group-hover:opacity-70 hover:!opacity-100"
              onClick={() => removeTag(tag)}
              type="button"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
      </div>
      <input
        className="mt-1.5 h-6 w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 text-[11px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-amber)]"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            addTag()
          }
        }}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="输入标签后回车"
        ref={inputRef}
        value={draft}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create card dialog
// ---------------------------------------------------------------------------

function CreateCardDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (type: CardType, title: string, summary: string, tags: string[]) => void
}): ReactElement {
  const [type, setType] = useState<CardType>('bug')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const titleRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const handleSubmit = () => {
    if (!title.trim()) return
    onCreate(type, title.trim(), summary.trim(), tags)
  }

  const addTag = () => {
    const trimmed = tagInput.trim()
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed])
    }
    setTagInput('')
  }

  const typeEntries = Object.entries(CARD_TYPE_META) as [CardType, typeof CARD_TYPE_META[CardType]][]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-[var(--overlay-bg)]"
        onClick={onClose}
      />
      <div className="relative w-[440px] rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-6 shadow-[var(--surface-shadow)]">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            新建知识卡片
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            记录一条值得沉淀的项目知识
          </p>
        </div>

        {/* Type selector */}
        <div className="mb-4">
          <p className="mb-2 text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
            卡片类型
          </p>
          <div className="flex flex-wrap gap-1.5">
            {typeEntries.map(([cardType, meta]) => {
              const Icon = CARD_TYPE_ICONS[cardType]
              return (
                <button
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition-colors',
                    type === cardType
                      ? 'border-[var(--accent-amber)] bg-[var(--sidebar-active-bg)] text-[var(--text-primary)]'
                      : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-default)] hover:text-[var(--text-secondary)]',
                  )}
                  key={cardType}
                  onClick={() => setType(cardType)}
                  type="button"
                >
                  <Icon className="h-3 w-3" style={{ color: meta.color }} />
                  {meta.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Title */}
        <div className="mb-3">
          <input
            className="h-9 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-amber)]"
            onChange={(e) => setTitle(e.target.value)}
            placeholder="标题"
            ref={titleRef}
            value={title}
          />
        </div>

        {/* Summary */}
        <div className="mb-3">
          <textarea
            className="w-full resize-none rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2 text-[13px] leading-5 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-amber)]"
            onChange={(e) => setSummary(e.target.value)}
            placeholder="一句话摘要..."
            rows={3}
            value={summary}
          />
        </div>

        {/* Tags */}
        <div className="mb-5">
          <div className="flex flex-wrap gap-1 mb-1.5">
            {tags.map((tag) => (
              <span
                className="flex items-center gap-1 rounded-full bg-[var(--bg-overlay)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]"
                key={tag}
              >
                {tag}
                <button
                  onClick={() => setTags(tags.filter((t) => t !== tag))}
                  type="button"
                >
                  <X className="h-2.5 w-2.5 text-[var(--text-muted)]" />
                </button>
              </span>
            ))}
          </div>
          <input
            className="h-8 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-amber)]"
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTag()
              }
            }}
            placeholder="标签（回车添加）"
            value={tagInput}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            className="rounded-lg border border-[var(--border-subtle)] px-4 py-2 text-[13px] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-default)] hover:text-[var(--text-primary)]"
            onClick={onClose}
            type="button"
          >
            取消
          </button>
          <button
            className="rounded-lg bg-[var(--accent-amber)] px-4 py-2 text-[13px] font-medium text-[var(--bg-base)] transition-opacity hover:opacity-90 disabled:opacity-40"
            disabled={!title.trim()}
            onClick={handleSubmit}
            type="button"
          >
            创建
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyBoard({
  hasFilters,
  onCreateFirst,
}: {
  hasFilters: boolean
  onCreateFirst: () => void
}): ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
      <Sparkles className="h-8 w-8 text-[var(--text-muted)] opacity-30" />
      {hasFilters ? (
        <>
          <p className="text-sm text-[var(--text-muted)]">
            当前筛选条件下没有匹配的卡片
          </p>
          <p className="text-xs text-[var(--text-muted)] opacity-60">
            尝试调整筛选条件或重置筛选器
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-[var(--text-secondary)]">
            还没有知识卡片
          </p>
          <p className="max-w-xs text-xs leading-5 text-[var(--text-muted)]">
            把终端里的 Bug、踩坑经验、架构决策沉淀成卡片，让项目知识不再散落在终端历史里。
          </p>
          <button
            className="mt-2 rounded-lg border border-[var(--border-subtle)] px-4 py-2 text-[13px] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-amber)] hover:text-[var(--text-primary)]"
            onClick={onCreateFirst}
            type="button"
          >
            创建第一张卡片
          </button>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}
