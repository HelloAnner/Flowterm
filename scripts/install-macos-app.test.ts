// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import { installMacosApp, resolveMacosAppInstallPaths } from './install-macos-app.mjs'

const makeFs = (state: { existingPaths?: string[] } = {}) => {
  const existingPaths = new Set(state.existingPaths ?? [])

  return {
    existsSync: (targetPath: string) => existingPaths.has(targetPath),
    mkdirSync: vi.fn(),
    rmSync: vi.fn((targetPath: string) => {
      existingPaths.delete(targetPath)
    }),
    readFileSync: vi.fn((targetPath: string) => {
      if (targetPath !== '/repo/src-tauri/tauri.conf.json') {
        throw new Error(`Unexpected read: ${targetPath}`)
      }

      return JSON.stringify({ productName: 'Flowterm' })
    }),
  }
}

describe('resolveMacosAppInstallPaths', () => {
  it('reads the app name from tauri config and resolves default paths', () => {
    const fs = makeFs()

    expect(
      resolveMacosAppInstallPaths({
        cwd: '/repo',
        fs,
      }),
    ).toEqual({
      productName: 'Flowterm',
      tauriConfigPath: '/repo/src-tauri/tauri.conf.json',
      bundleAppPath: '/repo/src-tauri/target/release/bundle/macos/Flowterm.app',
      installDir: '/Applications',
      destinationAppPath: '/Applications/Flowterm.app',
    })
  })

  it('supports a custom install directory', () => {
    const fs = makeFs()

    expect(
      resolveMacosAppInstallPaths({
        cwd: '/repo',
        installDir: '/Users/anner/Applications',
        fs,
      }),
    ).toMatchObject({
      installDir: '/Users/anner/Applications',
      destinationAppPath: '/Users/anner/Applications/Flowterm.app',
    })
  })
})

describe('installMacosApp', () => {
  it('builds the app and replaces an existing installation', () => {
    const fs = makeFs({
      existingPaths: [
        '/repo/src-tauri/target/release/bundle/macos/Flowterm.app',
        '/Applications/Flowterm.app',
      ],
    })
    const ensureFrontendDeps = vi.fn(() => true)
    const spawnSync = vi
      .fn()
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 0 })
    const logger = {
      log: vi.fn(),
    }

    installMacosApp({
      cwd: '/repo',
      platform: 'darwin',
      fs,
      ensureFrontendDeps,
      spawnSync,
      logger,
    })

    expect(ensureFrontendDeps).toHaveBeenCalledWith({
      cwd: '/repo',
    })
    expect(spawnSync).toHaveBeenNthCalledWith(1, 'pnpm', ['tauri', 'build', '--bundles', 'app'], {
      cwd: '/repo',
      stdio: 'inherit',
    })
    expect(fs.mkdirSync).toHaveBeenCalledWith('/Applications', { recursive: true })
    expect(fs.rmSync).toHaveBeenCalledWith('/Applications/Flowterm.app', {
      force: true,
      recursive: true,
    })
    expect(spawnSync).toHaveBeenNthCalledWith(2, 'ditto', [
      '/repo/src-tauri/target/release/bundle/macos/Flowterm.app',
      '/Applications/Flowterm.app',
    ], {
      stdio: 'inherit',
    })
  })

  it('fails outside macOS before building', () => {
    const fs = makeFs()
    const ensureFrontendDeps = vi.fn()
    const spawnSync = vi.fn()

    expect(() =>
      installMacosApp({
        cwd: '/repo',
        platform: 'linux',
        fs,
        ensureFrontendDeps,
        spawnSync,
      }),
    ).toThrow('make install only supports macOS app installation.')

    expect(ensureFrontendDeps).not.toHaveBeenCalled()
    expect(spawnSync).not.toHaveBeenCalled()
  })
})
