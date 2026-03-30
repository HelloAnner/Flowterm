interface IdleTaskOptions {
  clearTimeout?: (handle: number) => void
  cancelIdleCallback?: (handle: number) => void
  requestIdleCallback?: ((callback: IdleRequestCallback) => number) | undefined
  setTimeout?: (callback: () => void, delay?: number) => number
}

export interface ScheduledIdleTask {
  cancel: () => void
}

export function scheduleIdleTask(
  task: () => void,
  options: IdleTaskOptions = {},
): ScheduledIdleTask {
  const requestIdleCallbackRef = options.requestIdleCallback
  const cancelIdleCallbackRef = options.cancelIdleCallback

  if (requestIdleCallbackRef) {
    const handle = requestIdleCallbackRef(() => {
      task()
    })

    return {
      cancel() {
        cancelIdleCallbackRef?.(handle)
      },
    }
  }

  const setTimeoutRef = options.setTimeout ?? window.setTimeout.bind(window)
  const clearTimeoutRef = options.clearTimeout ?? window.clearTimeout.bind(window)
  const handle = setTimeoutRef(() => {
    task()
  }, 1)

  return {
    cancel() {
      clearTimeoutRef(handle)
    },
  }
}
