import { describe, expect, it, vi } from 'vitest'

import { scheduleIdleTask } from './idle-task'

describe('scheduleIdleTask', () => {
  it('uses requestIdleCallback when available', () => {
    const requestIdleCallback = vi.fn().mockReturnValue(9)
    const cancelIdleCallback = vi.fn()
    const task = vi.fn()

    const scheduled = scheduleIdleTask(task, {
      cancelIdleCallback,
      requestIdleCallback,
      setTimeout,
    })

    expect(requestIdleCallback).toHaveBeenCalledTimes(1)

    scheduled.cancel()

    expect(cancelIdleCallback).toHaveBeenCalledWith(9)
  })

  it('falls back to timeout scheduling', () => {
    const task = vi.fn()
    const setTimeoutMock = vi.fn().mockReturnValue(11)
    const clearTimeoutMock = vi.fn()

    const scheduled = scheduleIdleTask(task, {
      clearTimeout: clearTimeoutMock,
      requestIdleCallback: undefined,
      setTimeout: setTimeoutMock,
    })

    expect(setTimeoutMock).toHaveBeenCalledTimes(1)

    scheduled.cancel()

    expect(clearTimeoutMock).toHaveBeenCalledWith(11)
  })
})
