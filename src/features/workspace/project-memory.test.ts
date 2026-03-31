import { describe, expect, it } from 'vitest'

import {
  createProjectWorkspaceState,
  normalizeTerminalPaneSizes,
} from './project-memory'

describe('project workspace memory', () => {
  it('creates a stable empty workspace state', () => {
    expect(createProjectWorkspaceState()).toEqual({
      activePaneId: null,
      isSplitView: true,
      railWidth: 44,
      selectedFilePath: null,
      terminalPaneSizes: [],
      treeExpandedPaths: {},
    })
  })

  it('rebalances pane sizes when the saved layout no longer matches pane count', () => {
    expect(normalizeTerminalPaneSizes([100], 2)).toEqual([50, 50])
    expect(normalizeTerminalPaneSizes([70, 30], 3)).toEqual([
      33.333333333333336,
      33.333333333333336,
      33.333333333333336,
    ])
  })

  it('normalizes valid pane sizes back to a 100-based layout', () => {
    expect(normalizeTerminalPaneSizes([20, 20], 2)).toEqual([50, 50])
    expect(normalizeTerminalPaneSizes([45, 55], 2)).toEqual([45, 55])
  })
})
