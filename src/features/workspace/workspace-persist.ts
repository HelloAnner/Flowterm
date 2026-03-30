export interface WorkspacePersistScheduler {
  schedule: (projectId: string, task: () => Promise<void>) => void
}

export function createWorkspacePersistScheduler(
  delayMs = 250,
): WorkspacePersistScheduler {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  return {
    schedule(projectId, task) {
      const existingTimer = timers.get(projectId)

      if (existingTimer) {
        clearTimeout(existingTimer)
      }

      const nextTimer = setTimeout(() => {
        timers.delete(projectId)
        void task()
      }, delayMs)

      timers.set(projectId, nextTimer)
    },
  }
}
