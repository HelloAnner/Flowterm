interface FrameSchedulerOptions {
  cancelFrame?: (handle: number) => void
  scheduleFrame?: (callback: FrameRequestCallback) => number
}

export interface FrameScheduler {
  cancel: () => void
  trigger: () => void
}

export function createFrameScheduler(
  onFrame: () => void,
  options: FrameSchedulerOptions = {},
): FrameScheduler {
  const scheduleFrame = options.scheduleFrame ?? requestAnimationFrame
  const cancelFrame = options.cancelFrame ?? cancelAnimationFrame
  let frameHandle: number | null = null

  return {
    cancel() {
      if (frameHandle === null) {
        return
      }

      cancelFrame(frameHandle)
      frameHandle = null
    },
    trigger() {
      if (frameHandle !== null) {
        return
      }

      frameHandle = scheduleFrame(() => {
        frameHandle = null
        onFrame()
      })
    },
  }
}
