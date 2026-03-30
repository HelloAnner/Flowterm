import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTerminalResizeScheduler } from './terminal-resize'

describe('createTerminalResizeScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('coalesces burst resize updates into one callback', () => {
    const onResize = vi.fn()
    const schedule = createTerminalResizeScheduler(onResize, 80)

    schedule({ cols: 80, rows: 24 })
    schedule({ cols: 82, rows: 26 })
    schedule({ cols: 84, rows: 28 })

    expect(onResize).not.toHaveBeenCalled()

    vi.advanceTimersByTime(80)

    expect(onResize).toHaveBeenCalledTimes(1)
    expect(onResize).toHaveBeenCalledWith({ cols: 84, rows: 28 })
  })

  it('skips consecutive duplicate dimensions', () => {
    const onResize = vi.fn()
    const schedule = createTerminalResizeScheduler(onResize, 80)

    schedule({ cols: 80, rows: 24 })
    vi.advanceTimersByTime(80)
    schedule({ cols: 80, rows: 24 })
    vi.advanceTimersByTime(80)

    expect(onResize).toHaveBeenCalledTimes(1)
  })
})
