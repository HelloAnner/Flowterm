import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { ensureFrontendDeps } from './ensure-frontend-deps.mjs'

const PNPM_COMMAND = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const DEFAULT_INSTALL_DIR = '/Applications'
const TAURI_BUILD_ARGS = ['tauri', 'build', '--bundles', 'app']

const resolveInstallDir = (installDir) =>
  installDir ?? process.env.FLOWTERM_INSTALL_DIR ?? DEFAULT_INSTALL_DIR

export const resolveMacosAppInstallPaths = ({
  cwd = process.cwd(),
  installDir,
  fs: fileSystem = fs,
} = {}) => {
  const tauriConfigPath = path.join(cwd, 'src-tauri', 'tauri.conf.json')
  const tauriConfig = JSON.parse(String(fileSystem.readFileSync(tauriConfigPath)))
  const productName = tauriConfig.productName

  if (typeof productName !== 'string' || productName.trim().length === 0) {
    throw new Error(`Missing productName in ${tauriConfigPath}.`)
  }

  const resolvedInstallDir = resolveInstallDir(installDir)

  return {
    productName,
    tauriConfigPath,
    bundleAppPath: path.join(
      cwd,
      'src-tauri',
      'target',
      'release',
      'bundle',
      'macos',
      `${productName}.app`,
    ),
    installDir: resolvedInstallDir,
    destinationAppPath: path.join(resolvedInstallDir, `${productName}.app`),
  }
}

export const installMacosApp = ({
  cwd = process.cwd(),
  installDir,
  platform = process.platform,
  fs: fileSystem = fs,
  ensureFrontendDeps: ensureDeps = ensureFrontendDeps,
  logger = console,
  spawnSync: runCommand = spawnSync,
} = {}) => {
  if (platform !== 'darwin') {
    throw new Error('make install only supports macOS app installation.')
  }

  ensureDeps({ cwd })

  const paths = resolveMacosAppInstallPaths({
    cwd,
    installDir,
    fs: fileSystem,
  })

  logger.log(`Building ${paths.productName}.app...`)

  const buildResult = runCommand(PNPM_COMMAND, TAURI_BUILD_ARGS, {
    cwd,
    stdio: 'inherit',
  })

  if (buildResult.status !== 0) {
    throw new Error(`Tauri build failed with status ${buildResult.status ?? 'unknown'}.`)
  }

  if (!fileSystem.existsSync(paths.bundleAppPath)) {
    throw new Error(`Built app not found at ${paths.bundleAppPath}.`)
  }

  fileSystem.mkdirSync(paths.installDir, { recursive: true })

  if (fileSystem.existsSync(paths.destinationAppPath)) {
    logger.log(`Replacing existing ${paths.destinationAppPath}...`)
    fileSystem.rmSync(paths.destinationAppPath, {
      force: true,
      recursive: true,
    })
  }

  logger.log(`Installing ${paths.productName}.app to ${paths.installDir}...`)

  const copyResult = runCommand('ditto', [paths.bundleAppPath, paths.destinationAppPath], {
    stdio: 'inherit',
  })

  if (copyResult.status !== 0) {
    throw new Error(`App install failed with status ${copyResult.status ?? 'unknown'}.`)
  }

  logger.log(`Installed ${paths.destinationAppPath}.`)

  return paths
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  try {
    installMacosApp()
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Failed to install the macOS app.',
    )
    process.exit(1)
  }
}
