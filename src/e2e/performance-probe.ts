import { subscribeTerminalOutput } from '../features/workspace/terminal-stream'
import type {
  PerformanceProbeReport,
  ProjectFileEntry,
  ProjectWorkspaceState,
} from '../lib/contracts'
import {
  addProject,
  completePerformanceProbe,
  isTauriEnvironment,
  readPerformanceProbeState,
  saveProjectWorkspace,
} from '../lib/tauri'
import { useWorkspaceStore } from '../stores/workspace-store'

const DEFAULT_TIMEOUT_MS = 20_000

let hasStarted = false

export async function maybeStartPerformanceProbe(): Promise<void> {
  if (hasStarted || !isTauriEnvironment()) {
    return
  }

  const probe = await readPerformanceProbeState()

  if (!probe.enabled) {
    return
  }

  hasStarted = true
  void runPerformanceScenario(probe.scenario ?? 'cold', probe.projectRoot)
}

async function runPerformanceScenario(
  scenario: string,
  projectRoot: string | null,
): Promise<void> {
  const report: PerformanceProbeReport = {
    metadata: {},
    metrics: {},
    scenario,
  }

  try {
    await waitForWorkspace((state) => {
      return !state.isBooting && state.activeProjectId && state.snapshot ? state : null
    })
    const rootProject = await ensureProbeProject(projectRoot)
    const activeProjectId = rootProject.id
    const activeProjectPath = rootProject.path
    const rootedState = await waitForWorkspace((state) => {
      return state.snapshot?.project.id === activeProjectId ? state : null
    })
    const primaryMetricName =
      scenario === 'warm' ? 'warmStartInteractiveMs' : 'coldStartInteractiveMs'

    report.metrics[primaryMetricName] = await currentProcessUptime()
    report.metadata.activeProjectId = activeProjectId
    report.metadata.activeProjectPath = activeProjectPath

    const terminalReadyState = await waitForWorkspace((state) => {
      const panes = state.terminalProjectStateByProject[activeProjectId]?.paneOrder ?? []
      return panes.length > 0 ? state : null
    })
    const primaryPane =
      terminalReadyState.terminalProjectStateByProject[activeProjectId].panesById.main ??
      terminalReadyState.terminalProjectStateByProject[activeProjectId].panesById[
        terminalReadyState.terminalProjectStateByProject[activeProjectId].paneOrder[0]
      ]

    report.metrics.firstTerminalReadyMs = await currentProcessUptime()
    report.metadata.primarySessionId = primaryPane.sessionId

    const targetFile = pickProbeFile(rootedState.snapshot!.files)

    if (targetFile) {
      const filePreviewStart = performance.now()
      await useWorkspaceStore.getState().selectFile(targetFile)
      report.metrics.openPreviewMs = performance.now() - filePreviewStart
      report.metadata.selectedFilePath = targetFile
    }

    if (scenario !== 'warm') {
      const docsPath = `${activeProjectPath}/docs`
      const srcTauriPath = `${activeProjectPath}/src-tauri`

      await addProjectToWorkspace(docsPath, 'docs')
      await addProjectToWorkspace(srcTauriPath, 'src-tauri')

      const tabSwitchStart = performance.now()
      await useWorkspaceStore.getState().selectProject(activeProjectId)
      report.metrics.tabSwitchMs = performance.now() - tabSwitchStart

      const addPaneStart = performance.now()
      await useWorkspaceStore.getState().addTerminalPane(activeProjectId)
      await waitForWorkspace((state) => {
        const paneCount =
          state.terminalProjectStateByProject[activeProjectId]?.paneOrder.length ?? 0
        return paneCount >= 2 ? state : null
      })
      report.metrics.createPaneMs = performance.now() - addPaneStart

      await measureTerminalEcho(primaryPane.sessionId, report)
      await persistWorkspaceState(activeProjectId, targetFile)
    } else {
      report.metrics.workspaceRestoreMs = await currentProcessUptime()
      report.metadata.restoredProjectCount = String(useWorkspaceStore.getState().projects.length)
      report.metadata.restoredPaneCount = String(
        useWorkspaceStore.getState().terminalProjectStateByProject[activeProjectId]
          ?.paneOrder.length ?? 0,
      )
    }

    await completePerformanceProbe(report, 0)
  } catch (error) {
    report.metadata.error = formatProbeError(error)
    await completePerformanceProbe(report, 1)
  }
}

async function addProjectToWorkspace(path: string, name: string): Promise<void> {
  const bootstrap = await addProject(path, name)
  const store = useWorkspaceStore.getState()

  store.applyBootstrap(bootstrap)

  if (bootstrap.activeProjectId && store.selectedFilePath) {
    await store.fetchFilePreview(bootstrap.activeProjectId, store.selectedFilePath)
  }
}

async function ensureProbeProject(projectRoot: string | null): Promise<{
  id: string
  path: string
}> {
  const initialState = useWorkspaceStore.getState()
  const normalizedRoot = projectRoot ? projectRoot.replace(/\/+$/, '') : null

  if (!normalizedRoot) {
    return {
      id: initialState.activeProjectId!,
      path: initialState.snapshot!.project.path,
    }
  }

  const existing = initialState.projects.find(
    (project) => project.path.replace(/\/+$/, '') === normalizedRoot,
  )

  if (existing) {
    await initialState.selectProject(existing.id)
    return { id: existing.id, path: existing.path }
  }

  await addProjectToWorkspace(normalizedRoot, 'flowterm')
  const nextState = useWorkspaceStore.getState()
  const added = nextState.projects.find(
    (project) => project.path.replace(/\/+$/, '') === normalizedRoot,
  )

  if (!added) {
    throw new Error(`failed to add performance probe project ${normalizedRoot}`)
  }

  await nextState.selectProject(added.id)
  return { id: added.id, path: added.path }
}

async function currentProcessUptime(): Promise<number> {
  const probe = await readPerformanceProbeState()
  return probe.processUptimeMs
}

function pickProbeFile(files: ProjectFileEntry[]): string | null {
  const preferred = ['package.json', 'src/App.tsx', 'README.md', 'src-tauri/src/lib.rs']

  for (const candidate of preferred) {
    if (files.some((file) => file.path === candidate)) {
      return candidate
    }
  }

  return files[0]?.path ?? null
}

async function persistWorkspaceState(
  projectId: string,
  selectedFilePath: string | null,
): Promise<void> {
  const workspaceState: ProjectWorkspaceState = {
    selectedFilePath,
    terminalPaneSizes: [65, 35],
    treeExpandedPaths: {},
  }

  await saveProjectWorkspace(projectId, workspaceState)
}

async function measureTerminalEcho(
  sessionId: string,
  report: PerformanceProbeReport,
): Promise<void> {
  const token = `FLOWTERM_E2E_${Date.now()}`

  const echoed = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe()
      reject(new Error(`timed out waiting for terminal echo ${token}`))
    }, DEFAULT_TIMEOUT_MS)
    const unsubscribe = subscribeTerminalOutput(sessionId, (chunk) => {
      if (!chunk.includes(token)) {
        return
      }

      clearTimeout(timeout)
      unsubscribe()
      resolve()
    })
  })
  const echoStart = performance.now()

  await useWorkspaceStore.getState().writeTerminal(sessionId, `printf '%s\\n' '${token}'\n`)
  await echoed

  report.metrics.terminalEchoMs = performance.now() - echoStart
}

async function waitForWorkspace<T>(
  select: (state: ReturnType<typeof useWorkspaceStore.getState>) => T | null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const current = select(useWorkspaceStore.getState())

  if (current !== null) {
    return current
  }

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe()
      reject(new Error('timed out waiting for workspace condition'))
    }, timeoutMs)
    const unsubscribe = useWorkspaceStore.subscribe((state) => {
      const next = select(state)

      if (next === null) {
        return
      }

      clearTimeout(timeout)
      unsubscribe()
      resolve(next)
    })
  })
}

function formatProbeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  try {
    return JSON.stringify(error)
  } catch {
    return 'unknown performance probe failure'
  }
}
