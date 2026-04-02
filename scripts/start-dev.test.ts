// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import { rebuildAndStartDev } from './start-dev.mjs'

const makeFs = (state: { existingPaths?: string[] } = {}) => {
  const existingPaths = new Set(state.existingPaths ?? [])

  return {
    existsSync: (targetPath: string) => existingPaths.has(targetPath),
    rmSync: vi.fn((targetPath: string) => {
      existingPaths.delete(targetPath)
    }),
  }
}

describe('rebuildAndStartDev', () => {
  it('cleans dist, clears Rust build artifacts, and then starts Tauri dev', () => {
    const fs = makeFs({
      existingPaths: ['/repo/dist'],
    })
    const spawnSync = vi.fn(() => ({ status: 0 }))

    rebuildAndStartDev({
      cwd: '/repo',
      fs,
      spawnSync,
    })

    expect(fs.rmSync).toHaveBeenCalledWith('/repo/dist', {
      force: true,
      recursive: true,
    })
    expect(spawnSync).toHaveBeenNthCalledWith(
      1,
      'cargo',
      ['clean', '--manifest-path', '/repo/src-tauri/Cargo.toml'],
      {
        cwd: '/repo',
        stdio: 'inherit',
      },
    )
    expect(spawnSync).toHaveBeenNthCalledWith(2, 'pnpm', ['start'], {
      cwd: '/repo',
      stdio: 'inherit',
    })
  })

  it('stops before start when cargo clean fails', () => {
    const fs = makeFs()
    const spawnSync = vi.fn(() => ({ status: 1 }))

    expect(() =>
      rebuildAndStartDev({
        cwd: '/repo',
        fs,
        spawnSync,
      }),
    ).toThrow('cargo clean failed with status 1')

    expect(spawnSync).toHaveBeenCalledTimes(1)
    expect(spawnSync).not.toHaveBeenCalledWith('pnpm', ['start'], expect.anything())
  })
})
