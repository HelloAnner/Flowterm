export interface TerminalDimensions {
  cols: number
  rows: number
}

export interface TerminalResizeScheduler {
  (dimensions: TerminalDimensions): void
  cancel: () => void
}

export function createTerminalResizeScheduler(
  onResize: (dimensions: TerminalDimensions) => void,
  delayMs = 80,
): TerminalResizeScheduler {
  let lastApplied: TerminalDimensions | null = null
  let pending: TerminalDimensions | null = null
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    timeoutId = null

    if (!pending || isSameDimensions(lastApplied, pending)) {
      pending = null
      return
    }

    const nextDimensions = pending
    pending = null
    lastApplied = nextDimensions
    onResize(nextDimensions)
  }

  const schedule = ((dimensions: TerminalDimensions) => {
    pending = dimensions

    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    timeoutId = setTimeout(flush, delayMs)
  }) as TerminalResizeScheduler

  schedule.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }

    pending = null
  }

  return schedule
}

function isSameDimensions(
  left: TerminalDimensions | null,
  right: TerminalDimensions,
): boolean {
  return Boolean(left && left.cols === right.cols && left.rows === right.rows)
}
