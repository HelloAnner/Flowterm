import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createWorkspacePersistScheduler } from './workspace-persist'

describe('createWorkspacePersistScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('coalesces repeated saves for the same project', async () => {
    const task = vi.fn().mockResolvedValue(undefined)
    const scheduler = createWorkspacePersistScheduler(250)

    scheduler.schedule('project-a', task)
    scheduler.schedule('project-a', task)

    vi.advanceTimersByTime(249)
    expect(task).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    await Promise.resolve()

    expect(task).toHaveBeenCalledTimes(1)
  })

  it('keeps separate projects independent', async () => {
    const taskA = vi.fn().mockResolvedValue(undefined)
    const taskB = vi.fn().mockResolvedValue(undefined)
    const scheduler = createWorkspacePersistScheduler(250)

    scheduler.schedule('project-a', taskA)
    scheduler.schedule('project-b', taskB)

    vi.advanceTimersByTime(250)
    await Promise.resolve()

    expect(taskA).toHaveBeenCalledTimes(1)
    expect(taskB).toHaveBeenCalledTimes(1)
  })
})
