// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import {
  ensureFrontendDeps,
  shouldInstallFrontendDeps,
} from './ensure-frontend-deps.mjs'

const makeFs = (mtimes: Record<string, number>) => ({
  existsSync: (targetPath: string) => targetPath in mtimes,
  statSync: (targetPath: string) => ({ mtimeMs: mtimes[targetPath] }),
})

describe('shouldInstallFrontendDeps', () => {
  it('returns true when node_modules is missing', () => {
    const fs = makeFs({
      '/repo/package.json': 10,
      '/repo/pnpm-lock.yaml': 20,
    })

    expect(
      shouldInstallFrontendDeps({
        fs,
        paths: {
          nodeModulesDir: '/repo/node_modules',
          modulesStateFile: '/repo/node_modules/.modules.yaml',
          packageJson: '/repo/package.json',
          lockfile: '/repo/pnpm-lock.yaml',
        },
      }),
    ).toBe(true)
  })

  it('returns true when the installed modules state is older than package metadata', () => {
    const fs = makeFs({
      '/repo/node_modules': 1,
      '/repo/node_modules/.modules.yaml': 10,
      '/repo/package.json': 30,
      '/repo/pnpm-lock.yaml': 20,
    })

    expect(
      shouldInstallFrontendDeps({
        fs,
        paths: {
          nodeModulesDir: '/repo/node_modules',
          modulesStateFile: '/repo/node_modules/.modules.yaml',
          packageJson: '/repo/package.json',
          lockfile: '/repo/pnpm-lock.yaml',
        },
      }),
    ).toBe(true)
  })

  it('returns false when installed modules are newer than package metadata', () => {
    const fs = makeFs({
      '/repo/node_modules': 1,
      '/repo/node_modules/.modules.yaml': 40,
      '/repo/package.json': 30,
      '/repo/pnpm-lock.yaml': 20,
    })

    expect(
      shouldInstallFrontendDeps({
        fs,
        paths: {
          nodeModulesDir: '/repo/node_modules',
          modulesStateFile: '/repo/node_modules/.modules.yaml',
          packageJson: '/repo/package.json',
          lockfile: '/repo/pnpm-lock.yaml',
        },
      }),
    ).toBe(false)
  })
})

describe('ensureFrontendDeps', () => {
  it('runs pnpm install when dependencies are stale', () => {
    const fs = makeFs({
      '/repo/node_modules': 1,
      '/repo/node_modules/.modules.yaml': 10,
      '/repo/package.json': 30,
      '/repo/pnpm-lock.yaml': 20,
    })
    const spawnSync = vi.fn(() => ({ status: 0 }))

    expect(
      ensureFrontendDeps({
        cwd: '/repo',
        fs,
        spawnSync,
      }),
    ).toBe(true)

    expect(spawnSync).toHaveBeenCalledWith('pnpm', ['install'], {
      cwd: '/repo',
      stdio: 'inherit',
    })
  })

  it('skips pnpm install when dependencies are already up to date', () => {
    const fs = makeFs({
      '/repo/node_modules': 1,
      '/repo/node_modules/.modules.yaml': 40,
      '/repo/package.json': 30,
      '/repo/pnpm-lock.yaml': 20,
    })
    const spawnSync = vi.fn(() => ({ status: 0 }))

    expect(
      ensureFrontendDeps({
        cwd: '/repo',
        fs,
        spawnSync,
      }),
    ).toBe(false)

    expect(spawnSync).not.toHaveBeenCalled()
  })
})
