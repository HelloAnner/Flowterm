import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const PNPM_COMMAND = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

export const resolveFrontendDepPaths = (cwd = process.cwd()) => ({
  nodeModulesDir: path.join(cwd, 'node_modules'),
  modulesStateFile: path.join(cwd, 'node_modules', '.modules.yaml'),
  packageJson: path.join(cwd, 'package.json'),
  lockfile: path.join(cwd, 'pnpm-lock.yaml'),
})

const readMtime = (fileSystem, targetPath) => fileSystem.statSync(targetPath).mtimeMs

export const shouldInstallFrontendDeps = ({
  fs: fileSystem = fs,
  paths = resolveFrontendDepPaths(),
} = {}) => {
  if (!fileSystem.existsSync(paths.nodeModulesDir)) {
    return true
  }

  if (!fileSystem.existsSync(paths.modulesStateFile)) {
    return true
  }

  const installedAt = readMtime(fileSystem, paths.modulesStateFile)
  const dependencyMetadataUpdatedAt = Math.max(
    readMtime(fileSystem, paths.packageJson),
    readMtime(fileSystem, paths.lockfile),
  )

  return dependencyMetadataUpdatedAt > installedAt
}

export const ensureFrontendDeps = ({
  cwd = process.cwd(),
  fs: fileSystem = fs,
  logger = console,
  spawnSync: runCommand = spawnSync,
} = {}) => {
  const paths = resolveFrontendDepPaths(cwd)

  if (!shouldInstallFrontendDeps({ fs: fileSystem, paths })) {
    return false
  }

  logger.log('Installing frontend dependencies...')

  const result = runCommand(PNPM_COMMAND, ['install'], {
    cwd,
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    throw new Error(`pnpm install failed with status ${result.status ?? 'unknown'}`)
  }

  return true
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  try {
    ensureFrontendDeps()
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Failed to ensure frontend dependencies.',
    )
    process.exit(1)
  }
}
