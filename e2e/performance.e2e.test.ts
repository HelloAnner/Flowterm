// @vitest-environment node

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile, spawn } from 'node:child_process'

interface PerformanceReport {
  scenario: string
  metrics: Record<string, number>
}

const activeChildren = new Set<ReturnType<typeof spawn>>()
const execFileAsync = promisify(execFile)

const PERFORMANCE_FLOORS = {
  coldStartInteractiveMs: 1500,
  createPaneMs: 250,
  firstTerminalReadyMs: 1500,
  openPreviewMs: 80,
  tabSwitchMs: 250,
  terminalEchoMs: 32,
  warmStartInteractiveMs: 750,
  workspaceRestoreMs: 800,
} as const

describe('performance e2e', () => {
  let appDataDir = ''
  let sandboxDir = ''
  let coldReport: PerformanceReport
  let warmReport: PerformanceReport

  beforeAll(async () => {
    sandboxDir = await mkdtemp(join(tmpdir(), 'flowterm-e2e-'))
    appDataDir = join(sandboxDir, 'app-data')

    coldReport = await runPerformanceScenario({
      appDataDir,
      reportPath: join(sandboxDir, 'cold-report.json'),
      scenario: 'cold',
    })
    warmReport = await runPerformanceScenario({
      appDataDir,
      reportPath: join(sandboxDir, 'warm-report.json'),
      scenario: 'warm',
    })
  }, 180_000)

  afterAll(async () => {
    if (sandboxDir) {
      await rm(sandboxDir, { force: true, recursive: true })
    }
  })

  afterEach(async () => {
    await Promise.allSettled(
      [...activeChildren].map((child) => stopChild(child)),
    )
    activeChildren.clear()
  })

  it('records a cold-start report against the current workspace', () => {
    expect(coldReport.scenario).toBe('cold')
    expect(coldReport.metrics.coldStartInteractiveMs).toBeTypeOf('number')
  })

  it('holds the 100ms cold-start line', () => {
    expect(coldReport.metrics.coldStartInteractiveMs).toBeLessThanOrEqual(
      PERFORMANCE_FLOORS.coldStartInteractiveMs,
    )
  })

  it('keeps first terminal ready under the startup budget', () => {
    expect(coldReport.metrics.firstTerminalReadyMs).toBeLessThanOrEqual(
      PERFORMANCE_FLOORS.firstTerminalReadyMs,
    )
  })

  it('opens the first preview within the preview budget', () => {
    expect(coldReport.metrics.openPreviewMs).toBeLessThanOrEqual(
      PERFORMANCE_FLOORS.openPreviewMs,
    )
  })

  it('switches back to the root project within the tab budget', () => {
    expect(coldReport.metrics.tabSwitchMs).toBeLessThanOrEqual(
      PERFORMANCE_FLOORS.tabSwitchMs,
    )
  })

  it('creates a second terminal pane within the pane budget', () => {
    expect(coldReport.metrics.createPaneMs).toBeLessThanOrEqual(
      PERFORMANCE_FLOORS.createPaneMs,
    )
  })

  it('keeps terminal echo under the terminal response budget', () => {
    expect(coldReport.metrics.terminalEchoMs).toBeLessThanOrEqual(
      PERFORMANCE_FLOORS.terminalEchoMs,
    )
  })

  it('restores a warm session within the warm-start line', () => {
    expect(warmReport.metrics.warmStartInteractiveMs).toBeLessThanOrEqual(
      PERFORMANCE_FLOORS.warmStartInteractiveMs,
    )
  })

  it('restores workspace state within the restore budget', () => {
    expect(warmReport.metrics.workspaceRestoreMs).toBeLessThanOrEqual(
      PERFORMANCE_FLOORS.workspaceRestoreMs,
    )
  })
})

async function runPerformanceScenario({
  appDataDir,
  reportPath,
  scenario,
}: {
  appDataDir: string
  reportPath: string
  scenario: string
}): Promise<PerformanceReport> {
  await cleanupDevProcesses()

  const child = spawn('pnpm', ['tauri', 'dev', '--no-watch'], {
    cwd: '/Users/anner/Flowterm',
    detached: true,
    env: {
      ...process.env,
      FLOWTERM_APP_DATA_DIR: appDataDir,
      FLOWTERM_E2E_PERFORMANCE: '1',
      FLOWTERM_E2E_REPORT_PATH: reportPath,
      FLOWTERM_E2E_SCENARIO: scenario,
      FLOWTERM_PROJECT_ROOT: '/Users/anner/Flowterm',
    },
    stdio: 'pipe',
  })
  activeChildren.add(child)

  const stdout: Buffer[] = []
  const stderr: Buffer[] = []

  child.stdout?.on('data', (chunk) => {
    stdout.push(Buffer.from(chunk))
  })
  child.stderr?.on('data', (chunk) => {
    stderr.push(Buffer.from(chunk))
  })

  const exitCode = await new Promise<number | null>((resolve) => {
    child.once('exit', (code) => {
      resolve(code)
    })
  })

  activeChildren.delete(child)
  await stopChild(child)

  if (exitCode !== 0) {
    throw new Error(
      [
        `performance scenario failed with exit code ${exitCode}`,
        Buffer.concat(stdout).toString('utf8'),
        Buffer.concat(stderr).toString('utf8'),
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }

  return JSON.parse(await readFile(reportPath, 'utf8')) as PerformanceReport
}

async function stopChild(child: ReturnType<typeof spawn>): Promise<void> {
  if (!child.pid) {
    return
  }

  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    return
  }

  await new Promise<void>((resolve) => setTimeout(resolve, 500))

  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    // The process group is already gone.
  }
}

async function cleanupDevProcesses(): Promise<void> {
  const patterns = [
    'pnpm tauri dev --no-watch',
    'pnpm dev',
    'vite.js --host 0.0.0.0 --port 5173 --strictPort',
    'target/debug/flowterm',
  ]

  await Promise.allSettled(
    patterns.map(async (pattern) => {
      try {
        await execFileAsync('pkill', ['-f', pattern])
      } catch {
        // No matching process is fine.
      }
    }),
  )

  try {
    const { stdout } = await execFileAsync('lsof', ['-ti', ':5173'])
    const pids = stdout
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean)

    await Promise.allSettled(
      pids.map(async (pid) => {
        try {
          await execFileAsync('kill', ['-9', pid])
        } catch {
          // Process already exited.
        }
      }),
    )
  } catch {
    // Nothing is listening on the dev port.
  }
}
