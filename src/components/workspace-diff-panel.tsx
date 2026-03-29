import type { ComponentType, ReactElement } from 'react'
import { GitCommitHorizontal, TimerReset } from 'lucide-react'

import { ScrollArea } from './ui/scroll-area'
import { Button } from './ui/button'
import { cn } from '../lib/utils'
import type { FileDiff } from '../lib/contracts'

interface WorkspaceDiffPanelProps {
  diffMode: 'git' | 'live'
  diffs: FileDiff[]
  onDiffModeChange: (mode: 'git' | 'live') => void
  selectedFilePath: string | null
}

export function WorkspaceDiffPanel({
  diffMode,
  diffs,
  onDiffModeChange,
  selectedFilePath,
}: WorkspaceDiffPanelProps): ReactElement {
  const diff = diffs.find((item) => item.path === selectedFilePath) ?? diffs[0] ?? null

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg-base)]">
      <div className="flex h-9 items-center justify-between border-b border-[var(--border-subtle)] px-4">
        <div className="min-w-0">
          <p className="truncate text-[13px] text-[var(--text-secondary)]">
            {diff?.path ?? '等待 Agent 改动文件...'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ToggleButton
            active={diffMode === 'live'}
            icon={TimerReset}
            label="实时"
            onClick={() => onDiffModeChange('live')}
          />
          <ToggleButton
            active={diffMode === 'git'}
            icon={GitCommitHorizontal}
            label="Git"
            onClick={() => onDiffModeChange('git')}
          />
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {diff ? (
          <div className="font-mono text-[13px] leading-6">
            {diff.lines.map((line, index) => (
              <div
                className={cn(
                  'grid grid-cols-[72px_72px_minmax(0,1fr)]',
                  line.kind === 'added' && 'bg-[rgba(122,158,138,0.12)]',
                  line.kind === 'removed' && 'bg-[rgba(160,96,80,0.12)]',
                )}
                key={`${diff.path}-${index}`}
              >
                <LineNumberCell
                  number={line.oldLineNumber}
                  tone={line.kind === 'removed' ? 'removed' : 'default'}
                />
                <LineNumberCell
                  number={line.newLineNumber}
                  tone={line.kind === 'added' ? 'added' : 'default'}
                />
                <pre className="overflow-x-auto px-4 py-0 text-[var(--text-primary)]">
                  {line.content}
                </pre>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full min-h-[16rem] items-center justify-center px-6 text-center text-sm text-[var(--text-muted)]">
            等待 Agent 改动文件...
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

interface ToggleButtonProps {
  active: boolean
  icon: ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}

function ToggleButton({
  active,
  icon: Icon,
  label,
  onClick,
}: ToggleButtonProps): ReactElement {
  return (
    <Button
      className={cn(
        active &&
          'border-[var(--accent-amber)] bg-[var(--bg-elevated)] text-[var(--accent-amber)]',
      )}
      onClick={onClick}
      size="sm"
      variant="outline"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Button>
  )
}

function LineNumberCell({
  number,
  tone,
}: {
  number: number | null
  tone: 'added' | 'default' | 'removed'
}): ReactElement {
  return (
    <div
      className={cn(
        'px-3 text-right text-[var(--text-muted)]',
        tone === 'added' && 'bg-[rgba(122,158,138,0.25)] text-[var(--text-primary)]',
        tone === 'removed' && 'bg-[rgba(160,96,80,0.25)] text-[var(--text-primary)]',
      )}
    >
      {number ?? ''}
    </div>
  )
}
