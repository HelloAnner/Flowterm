export interface PreviewRequestWindow {
  startLine: number
  lineCount: number
}

export interface PreviewWindowInput {
  totalLines: number
  scrollTop: number
  viewportHeight: number
  rowHeight: number
  overscanRows: number
  chunkSize: number
}

export interface PreviewRenderRangeInput {
  loadedLineCount: number
  previewStartLine: number
  scrollTop: number
  viewportHeight: number
  rowHeight: number
  overscanRows: number
}

export interface PreviewRenderRange {
  startIndex: number
  endIndex: number
}

export interface ImageViewportState {
  scale: number
  offsetX: number
  offsetY: number
}

const MIN_IMAGE_SCALE = 1
const MAX_IMAGE_SCALE = 4

export function resolvePreviewRequestWindow({
  chunkSize,
  overscanRows,
  rowHeight,
  scrollTop,
  totalLines,
  viewportHeight,
}: PreviewWindowInput): PreviewRequestWindow {
  const firstVisibleLine = Math.max(Math.floor(scrollTop / rowHeight), 0)
  const minimumWindowSize = Math.max(
    Math.ceil(viewportHeight / rowHeight) + overscanRows * 2,
    1,
  )
  const effectiveChunkSize = Math.max(chunkSize, minimumWindowSize)
  const anchorLine = Math.max(firstVisibleLine - overscanRows, 0)
  const maxStartLine = Math.max(totalLines - effectiveChunkSize, 0)

  return {
    lineCount: effectiveChunkSize,
    startLine: Math.min(anchorLine, maxStartLine),
  }
}

export function resolvePreviewRenderRange({
  loadedLineCount,
  overscanRows,
  previewStartLine,
  rowHeight,
  scrollTop,
  viewportHeight,
}: PreviewRenderRangeInput): PreviewRenderRange {
  if (loadedLineCount <= 0) {
    return {
      endIndex: 0,
      startIndex: 0,
    }
  }

  const visibleLineCount = Math.max(Math.ceil(viewportHeight / rowHeight), 1)
  const bufferedLineCount = visibleLineCount + overscanRows * 2
  const firstVisibleLine = Math.max(Math.floor(scrollTop / rowHeight), 0)
  const localFirstVisibleLine = firstVisibleLine - previewStartLine
  const unclampedStartIndex = localFirstVisibleLine - overscanRows
  const maxStartIndex = Math.max(loadedLineCount - bufferedLineCount, 0)
  const startIndex = Math.min(Math.max(unclampedStartIndex, 0), maxStartIndex)

  return {
    endIndex: Math.min(startIndex + bufferedLineCount, loadedLineCount),
    startIndex,
  }
}

export function createImageViewportState(): ImageViewportState {
  return {
    scale: MIN_IMAGE_SCALE,
    offsetX: 0,
    offsetY: 0,
  }
}

export function clampImageScale(scale: number): number {
  return Math.min(Math.max(scale, MIN_IMAGE_SCALE), MAX_IMAGE_SCALE)
}

export function zoomImageViewport(
  state: ImageViewportState,
  {
    nextScale,
    originX,
    originY,
  }: {
    nextScale: number
    originX: number
    originY: number
  },
): ImageViewportState {
  const scale = clampImageScale(nextScale)
  const ratio = scale / state.scale

  return {
    scale,
    offsetX: originX - (originX - state.offsetX) * ratio,
    offsetY: originY - (originY - state.offsetY) * ratio,
  }
}
