import type { ProjectWorkspaceState } from '../../lib/contracts'

export function createProjectWorkspaceState(): ProjectWorkspaceState {
  return {
    activePaneId: null,
    isSplitView: true,
    railWidth: 44,
    selectedFilePath: null,
    terminalPaneSizes: [],
    treeExpandedPaths: {},
  }
}

export function normalizeTerminalPaneSizes(
  sizes: number[],
  paneCount: number,
): number[] {
  if (paneCount <= 0) {
    return []
  }

  if (sizes.length !== paneCount) {
    return createEvenPaneSizes(paneCount)
  }

  const safeSizes = sizes.filter((value) => Number.isFinite(value) && value > 0)

  if (safeSizes.length !== paneCount) {
    return createEvenPaneSizes(paneCount)
  }

  const total = sizes.reduce((sum, value) => sum + value, 0)

  if (total <= 0) {
    return createEvenPaneSizes(paneCount)
  }

  return sizes.map((value) => normalizeTinyFloat((value / total) * 100))
}

function createEvenPaneSizes(count: number): number[] {
  return Array.from({ length: count }, () => 100 / count)
}

function normalizeTinyFloat(value: number): number {
  const rounded = Math.round(value)

  if (Math.abs(value - rounded) < 1e-9) {
    return rounded
  }

  return value
}
