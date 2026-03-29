import {
  type ReactElement,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Activity, Eye } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

import { ScrollArea } from './ui/scroll-area'
import { resolvePreviewRequestWindow, createImageViewportState, zoomImageViewport } from '../features/workspace/preview-window'
import { cn } from '../lib/utils'
import type { FilePreview, GitStatusCode, LiveStatus } from '../lib/contracts'

interface WorkspaceDiffPanelProps {
  isLoading: boolean
  onRequestWindow: (startLine: number, lineCount: number) => void
  preview: FilePreview | null
  selectedFilePath: string | null
}

export function WorkspaceDiffPanel({
  isLoading,
  onRequestWindow,
  preview,
  selectedFilePath,
}: WorkspaceDiffPanelProps): ReactElement {
  const deferredPreview = useDeferredValue(preview)

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg-base)]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4">
        <div className="min-w-0">
          {deferredPreview?.path ? (
            <p className="truncate font-mono text-[12px] text-[var(--text-muted)]">
              {deferredPreview.path}
            </p>
          ) : (
            <p className="text-[12px] text-[var(--text-muted)]">—</p>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2 py-1">
            <Eye className="h-3 w-3" />
            工作区预览
          </span>
          {deferredPreview ? (
            <StatusBadge
              gitStatus={deferredPreview.gitStatus}
              liveStatus={deferredPreview.liveStatus}
            />
          ) : null}
        </div>
      </div>
      {deferredPreview ? (
        deferredPreview.mode === 'image' ? (
          <ImagePreview preview={deferredPreview} />
        ) : deferredPreview.path.endsWith('.md') &&
          deferredPreview.totalLines === deferredPreview.lines.length ? (
          <MarkdownPreview preview={deferredPreview} />
        ) : (
          <VirtualizedPreview onRequestWindow={onRequestWindow} preview={deferredPreview} />
        )
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          {isLoading ? (
            <div className="flex h-full min-h-[16rem] items-center justify-center px-6 text-center font-mono text-[12px] tracking-wide text-[var(--text-muted)]">
              正在载入文件预览...
            </div>
          ) : (
            <div className="flex h-full min-h-[16rem] items-center justify-center px-6 text-center font-mono text-[12px] tracking-wide text-[var(--text-muted)]">
              {selectedFilePath ? '当前文件暂无可预览内容' : '从左侧选择一个文件开始预览'}
            </div>
          )}
        </ScrollArea>
      )}
    </div>
  )
}

const ROW_HEIGHT = 24
const OVERSCAN_ROWS = 24

function ImagePreview({
  preview,
}: {
  preview: FilePreview
}): ReactElement {
  const [hasDecodeError, setHasDecodeError] = useState(false)
  const [viewport, setViewport] = useState(createImageViewportState())
  const dragStartRef = useRef<{
    originX: number
    originY: number
    startOffsetX: number
    startOffsetY: number
  } | null>(null)

  useEffect(() => {
    setHasDecodeError(false)
    setViewport(createImageViewportState())
  }, [preview.imageDataUrl, preview.path])

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div
        className="flex min-h-full items-start justify-center overflow-hidden bg-[var(--bg-base)] p-6"
        onMouseLeave={() => {
          dragStartRef.current = null
        }}
        onMouseMove={(event) => {
          if (!dragStartRef.current || viewport.scale <= 1) {
            return
          }

          setViewport((current) => ({
            ...current,
            offsetX: dragStartRef.current!.startOffsetX + event.clientX - dragStartRef.current!.originX,
            offsetY: dragStartRef.current!.startOffsetY + event.clientY - dragStartRef.current!.originY,
          }))
        }}
        onMouseUp={() => {
          dragStartRef.current = null
        }}
        onWheel={(event) => {
          if (!preview.imageDataUrl) {
            return
          }

          event.preventDefault()

          const nextScale =
            event.deltaY < 0 ? viewport.scale * 1.12 : viewport.scale / 1.12

          setViewport((current) =>
            zoomImageViewport(current, {
              nextScale,
              originX: event.clientX,
              originY: event.clientY,
            }),
          )
        }}
      >
        {preview.imageDataUrl && !hasDecodeError ? (
          <img
            alt={preview.path}
            className={cn(
              'h-auto max-w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] object-contain shadow-[0_24px_80px_rgba(0,0,0,0.28)] transition-transform',
              viewport.scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in',
            )}
            loading="lazy"
            onDoubleClick={(event) => {
              setViewport((current) =>
                current.scale > 1
                  ? createImageViewportState()
                  : zoomImageViewport(current, {
                      nextScale: 2,
                      originX: event.clientX,
                      originY: event.clientY,
                    }),
              )
            }}
            onError={() => setHasDecodeError(true)}
            onMouseDown={(event) => {
              if (viewport.scale <= 1) {
                return
              }

              dragStartRef.current = {
                originX: event.clientX,
                originY: event.clientY,
                startOffsetX: viewport.offsetX,
                startOffsetY: viewport.offsetY,
              }
            }}
            src={preview.imageDataUrl}
            style={{
              transform: `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.scale})`,
              transformOrigin: 'top left',
            }}
          />
        ) : (
          <div className="flex min-h-[16rem] items-center justify-center px-6 text-center font-mono text-[12px] tracking-wide text-[var(--text-muted)]">
            当前图片暂时不可预览
          </div>
        )}
      </div>
    </ScrollArea>
  )
}

function VirtualizedPreview({
  onRequestWindow,
  preview,
}: {
  onRequestWindow: (startLine: number, lineCount: number) => void
  preview: FilePreview
}): ReactElement {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)

  useEffect(() => {
    const viewport = viewportRef.current

    if (!viewport) {
      return
    }

    const syncScroll = () => {
      setScrollTop(viewport.scrollTop)
    }

    const syncHeight = () => {
      setViewportHeight(viewport.clientHeight)
    }

    syncScroll()
    syncHeight()

    viewport.addEventListener('scroll', syncScroll, { passive: true })

    if (typeof ResizeObserver === 'undefined') {
      return () => {
        viewport.removeEventListener('scroll', syncScroll)
      }
    }

    const resizeObserver = new ResizeObserver(() => {
      syncHeight()
    })
    resizeObserver.observe(viewport)

    return () => {
      viewport.removeEventListener('scroll', syncScroll)
      resizeObserver.disconnect()
    }
  }, [preview.path])

  useEffect(() => {
    const viewport = viewportRef.current

    if (!viewport) {
      return
    }

    viewport.scrollTo({ top: 0 })
    setScrollTop(0)
  }, [preview.path])

  useEffect(() => {
    if (preview.mode !== 'text' || preview.totalLines <= preview.lines.length) {
      return
    }

    const nextWindow = resolvePreviewRequestWindow({
      chunkSize: 200,
      overscanRows: OVERSCAN_ROWS,
      rowHeight: ROW_HEIGHT,
      scrollTop,
      totalLines: preview.totalLines,
      viewportHeight: viewportHeight || ROW_HEIGHT * 24,
    })

    if (
      nextWindow.startLine === preview.startLine &&
      preview.startLine + preview.lines.length >=
        Math.min(nextWindow.startLine + nextWindow.lineCount, preview.totalLines)
    ) {
      return
    }

    onRequestWindow(nextWindow.startLine, nextWindow.lineCount)
  }, [
    onRequestWindow,
    preview.lines.length,
    preview.mode,
    preview.startLine,
    preview.totalLines,
    scrollTop,
    viewportHeight,
  ])

  const { offsetTop, visibleLines } = useMemo(() => {
    return {
      offsetTop: preview.startLine * ROW_HEIGHT,
      visibleLines: preview.lines.map((line, index) => ({
        index: preview.startLine + index,
        line,
      })),
    }
  }, [preview.lines, preview.startLine])

  return (
    <ScrollArea className="min-h-0 flex-1" viewportRef={viewportRef}>
      <div
        className="relative font-mono text-[13px] leading-6"
        style={{ height: `${Math.max(preview.totalLines * ROW_HEIGHT, ROW_HEIGHT)}px` }}
      >
        <div style={{ transform: `translateY(${offsetTop}px)` }}>
          {visibleLines.map(({ index, line }) =>
            preview.mode === 'diff' ? (
              <div
                className={cn(
                  'grid h-6 grid-cols-[72px_72px_minmax(0,1fr)]',
                  line.kind === 'added' && 'bg-[rgba(122,158,138,0.12)]',
                  line.kind === 'removed' && 'bg-[rgba(160,96,80,0.12)]',
                )}
                key={`${preview.path}-${index}`}
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
            ) : (
              <div
                className="grid h-6 grid-cols-[72px_minmax(0,1fr)]"
                key={`${preview.path}-${index}`}
              >
                <LineNumberCell number={line.newLineNumber} tone="default" />
                <pre className="overflow-x-auto px-4 py-0 text-[var(--text-primary)]">
                  {line.content}
                </pre>
              </div>
            ),
          )}
        </div>
      </div>
    </ScrollArea>
  )
}

function StatusBadge({
  gitStatus,
  liveStatus,
}: {
  gitStatus: GitStatusCode
  liveStatus: LiveStatus
}): ReactElement {
  const label = resolveStatusCopy(gitStatus, liveStatus)

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-1',
        gitStatus === 'A' && 'border-[rgba(122,158,138,0.3)] text-[var(--accent-sage)]',
        gitStatus === 'D' && 'border-[rgba(160,96,80,0.3)] text-[var(--accent-clay)]',
        gitStatus === 'M' && 'border-[rgba(200,169,110,0.3)] text-[var(--accent-amber)]',
        gitStatus === '?' && 'border-[var(--border-default)] text-[var(--text-secondary)]',
        gitStatus === ' ' &&
          'border-[var(--border-default)] text-[var(--text-muted)]',
      )}
    >
      {liveStatus !== 'idle' ? <Activity className="h-3 w-3" /> : null}
      {label}
    </span>
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

function MarkdownPreview({ preview }: { preview: FilePreview }): ReactElement {
  const content = preview.lines.map((l) => l.content).join('\n')

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="md-prose px-8 py-6">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </ScrollArea>
  )
}

function resolveStatusCopy(
  gitStatus: GitStatusCode,
  liveStatus: LiveStatus,
): string {
  if (gitStatus === 'A') {
    return '新增'
  }
  if (gitStatus === 'D') {
    return '删除'
  }
  if (gitStatus === 'M') {
    return '修改'
  }
  if (gitStatus === '?') {
    return '未跟踪'
  }
  if (liveStatus !== 'idle') {
    return '已刷新'
  }
  return '已同步'
}
