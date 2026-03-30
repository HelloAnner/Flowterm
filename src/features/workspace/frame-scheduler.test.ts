import { describe, expect, it, vi } from 'vitest'

import { createFrameScheduler } from './frame-scheduler'

describe('createFrameScheduler', () => {
  it('coalesces multiple triggers into one frame callback', () => {
    const onFrame = vi.fn()
    let queuedFrame: FrameRequestCallback | null = null
    const scheduler = createFrameScheduler(onFrame, {
      cancelFrame: vi.fn(),
      scheduleFrame: (callback) => {
        queuedFrame = callback
        return 1
      },
    })

    scheduler.trigger()
    scheduler.trigger()
    scheduler.trigger()

    expect(onFrame).not.toHaveBeenCalled()
    expect(queuedFrame).not.toBeNull()

    if (!queuedFrame) {
      throw new Error('expected a queued animation frame callback')
    }

    const frameCallback: FrameRequestCallback = queuedFrame

    frameCallback(16)

    expect(onFrame).toHaveBeenCalledTimes(1)
  })

  it('cancels a queued frame', () => {
    const cancelFrame = vi.fn()
    const scheduler = createFrameScheduler(vi.fn(), {
      cancelFrame,
      scheduleFrame: () => 7,
    })

    scheduler.trigger()
    scheduler.cancel()

    expect(cancelFrame).toHaveBeenCalledWith(7)
  })
})
