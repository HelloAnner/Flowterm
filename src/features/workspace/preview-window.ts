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
