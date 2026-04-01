import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@xterm/xterm', () => {
  class MockTerminal {
    dispose = vi.fn()
    loadAddon = vi.fn()
    onData = vi.fn().mockReturnValue({ dispose: vi.fn() })
    open = vi.fn()
    options: Record<string, unknown> = {}
    write = vi.fn()
  }
  return { Terminal: MockTerminal }
})

vi.mock('@xterm/addon-fit', () => {
  class MockFitAddon {
    fit = vi.fn()
    proposeDimensions = vi.fn().mockReturnValue({ cols: 80, rows: 24 })
  }
  return { FitAddon: MockFitAddon }
})

vi.mock('@xterm/addon-webgl', () => {
  class MockWebglAddon {
    onContextLoss = vi.fn()
  }
  return { WebglAddon: MockWebglAddon }
})

vi.mock('./terminal-stream', () => ({
  claimTerminalHistory: vi.fn().mockReturnValue(''),
  subscribeTerminalOutput: vi.fn().mockReturnValue(vi.fn()),
}))

vi.mock('./terminal-resize', () => ({
  createTerminalResizeScheduler: vi.fn().mockImplementation(() => {
    const scheduler = Object.assign(vi.fn(), { cancel: vi.fn() })
    return scheduler
  }),
}))

import {
  acquireTerminal,
  clearPool,
  destroyTerminal,
  getPoolSize,
  releaseTerminal,
} from './terminal-pool'

const mockResize = vi.fn().mockResolvedValue(undefined)
const mockWrite = vi.fn().mockResolvedValue(undefined)
const defaultTheme = { background: '#1a1a1a', cursor: '#e0e0e0', foreground: '#d4d4d4' }
const defaultTypography = { fontSize: 12, letterSpacing: -0.6, lineHeight: 1.22 }

describe('terminal-pool', () => {
  beforeEach(() => {
    clearPool()
  })

  it('creates a new terminal instance on first acquire', () => {
    const pooled = acquireTerminal('session-1', '', defaultTheme, defaultTypography, mockResize, mockWrite)
    expect(pooled.sessionId).toBe('session-1')
    expect(pooled.container).toBeDefined()
    expect(pooled.terminal).toBeDefined()
    expect(getPoolSize()).toBe(1)
  })

  it('returns the same instance on repeated acquire', () => {
    const first = acquireTerminal('session-1', '', defaultTheme, defaultTypography, mockResize, mockWrite)
    const second = acquireTerminal('session-1', '', defaultTheme, defaultTypography, mockResize, mockWrite)
    expect(first).toBe(second)
    expect(getPoolSize()).toBe(1)
  })

  it('release detaches container but keeps instance in pool', () => {
    acquireTerminal('session-1', '', defaultTheme, defaultTypography, mockResize, mockWrite)
    releaseTerminal('session-1')
    expect(getPoolSize()).toBe(1)
  })

  it('destroy removes instance from pool', () => {
    acquireTerminal('session-1', '', defaultTheme, defaultTypography, mockResize, mockWrite)
    destroyTerminal('session-1')
    expect(getPoolSize()).toBe(0)
  })

  it('evicts oldest instances when pool exceeds max size', () => {
    for (let i = 0; i < 12; i++) {
      acquireTerminal(`session-${i}`, '', defaultTheme, defaultTypography, mockResize, mockWrite)
    }
    expect(getPoolSize()).toBe(10)
  })

  it('clearPool removes all instances', () => {
    for (let i = 0; i < 5; i++) {
      acquireTerminal(`session-${i}`, '', defaultTheme, defaultTypography, mockResize, mockWrite)
    }
    clearPool()
    expect(getPoolSize()).toBe(0)
  })
})
