import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const PNPM_COMMAND = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const CARGO_COMMAND = process.platform === 'win32' ? 'cargo.exe' : 'cargo'

export const resolveDevRebuildPaths = (cwd = process.cwd()) => ({
  frontendDistDir: path.join(cwd, 'dist'),
  tauriManifestPath: path.join(cwd, 'src-tauri', 'Cargo.toml'),
})

export const rebuildAndStartDev = ({
  cwd = process.cwd(),
  fs: fileSystem = fs,
  logger = console,
  spawnSync: runCommand = spawnSync,
} = {}) => {
  const paths = resolveDevRebuildPaths(cwd)

  if (fileSystem.existsSync(paths.frontendDistDir)) {
    logger.log('Removing frontend build output...')
    fileSystem.rmSync(paths.frontendDistDir, {
      force: true,
      recursive: true,
    })
  }

  logger.log('Cleaning Rust build artifacts...')

  const cleanResult = runCommand(
    CARGO_COMMAND,
    ['clean', '--manifest-path', paths.tauriManifestPath],
    {
      cwd,
      stdio: 'inherit',
    },
  )

  if (cleanResult.status !== 0) {
    throw new Error(`cargo clean failed with status ${cleanResult.status ?? 'unknown'}`)
  }

  const startResult = runCommand(PNPM_COMMAND, ['start'], {
    cwd,
    stdio: 'inherit',
  })

  if (startResult.status !== 0) {
    throw new Error(`pnpm start failed with status ${startResult.status ?? 'unknown'}`)
  }
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  try {
    rebuildAndStartDev()
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Failed to rebuild and start the development app.',
    )
    process.exit(1)
  }
}
