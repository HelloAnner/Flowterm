import { describe, expect, it } from 'vitest'

import {
  clampImageScale,
  createImageViewportState,
  resolvePreviewRenderRange,
  resolvePreviewRequestWindow,
  zoomImageViewport,
} from './preview-window'

describe('resolvePreviewRequestWindow', () => {
  it('requests a buffered line window around the visible viewport', () => {
    expect(
      resolvePreviewRequestWindow({
        chunkSize: 160,
        overscanRows: 24,
        rowHeight: 24,
        scrollTop: 480,
        totalLines: 1200,
        viewportHeight: 480,
      }),
    ).toEqual({
      lineCount: 160,
      startLine: 0,
    })
  })

  it('clamps the request window near the end of the file', () => {
    expect(
      resolvePreviewRequestWindow({
        chunkSize: 160,
        overscanRows: 24,
        rowHeight: 24,
        scrollTop: 24 * 1180,
        totalLines: 1200,
        viewportHeight: 480,
      }),
    ).toEqual({
      lineCount: 160,
      startLine: 1040,
    })
  })
})

describe('resolvePreviewRenderRange', () => {
  it('maps viewport metrics into a bounded local slice for the loaded chunk', () => {
    expect(
      resolvePreviewRenderRange({
        loadedLineCount: 200,
        overscanRows: 2,
        previewStartLine: 100,
        rowHeight: 24,
        scrollTop: 24 * 110,
        viewportHeight: 24 * 10,
      }),
    ).toEqual({
      endIndex: 22,
      startIndex: 8,
    })
  })

  it('clamps the render range when the viewport lands beyond the loaded chunk', () => {
    expect(
      resolvePreviewRenderRange({
        loadedLineCount: 30,
        overscanRows: 4,
        previewStartLine: 100,
        rowHeight: 24,
        scrollTop: 24 * 140,
        viewportHeight: 24 * 12,
      }),
    ).toEqual({
      endIndex: 30,
      startIndex: 10,
    })
  })
})

describe('image viewport helpers', () => {
  it('clamps image scale into the supported range', () => {
    expect(clampImageScale(0.1)).toBe(1)
    expect(clampImageScale(5)).toBe(4)
  })

  it('zooms around a pointer position', () => {
    const state = createImageViewportState()

    expect(
      zoomImageViewport(state, {
        nextScale: 2,
        originX: 200,
        originY: 120,
      }),
    ).toEqual({
      offsetX: -200,
      offsetY: -120,
      scale: 2,
    })
  })
})
