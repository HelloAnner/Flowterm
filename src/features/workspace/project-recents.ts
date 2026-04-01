const RECENT_PROJECTS_STORAGE_KEY = 'flowterm:recent-project-ids'

interface ProjectIdentity {
  id: string
}

export function readRecentProjectIds(): string[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const rawValue = window.localStorage.getItem(RECENT_PROJECTS_STORAGE_KEY)

    if (!rawValue) {
      return []
    }

    const parsed = JSON.parse(rawValue)

    if (!Array.isArray(parsed)) {
      return []
    }

    return normalizeRecentProjectIds(parsed)
  } catch {
    return []
  }
}

export function storeRecentProjectIds(projectIds: string[]): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(
      RECENT_PROJECTS_STORAGE_KEY,
      JSON.stringify(normalizeRecentProjectIds(projectIds)),
    )
  } catch {
    return
  }
}

export function bumpProjectToFront(
  projectIds: string[],
  activeProjectId: string | null | undefined,
): string[] {
  const nextProjectIds = normalizeRecentProjectIds(projectIds)

  if (!activeProjectId) {
    return nextProjectIds
  }

  return [
    activeProjectId,
    ...nextProjectIds.filter((projectId) => projectId !== activeProjectId),
  ]
}

export function orderProjectsByRecency<Project extends ProjectIdentity>(
  projects: Project[],
  recentProjectIds: string[],
): Project[] {
  const projectsById = new Map(projects.map((project) => [project.id, project]))
  const orderedProjects: Project[] = []

  for (const projectId of normalizeRecentProjectIds(recentProjectIds)) {
    const project = projectsById.get(projectId)

    if (!project) {
      continue
    }

    orderedProjects.push(project)
    projectsById.delete(projectId)
  }

  for (const project of projects) {
    if (!projectsById.has(project.id)) {
      continue
    }

    orderedProjects.push(project)
    projectsById.delete(project.id)
  }

  return orderedProjects
}

function normalizeRecentProjectIds(projectIds: unknown[]): string[] {
  const seenProjectIds = new Set<string>()
  const normalizedProjectIds: string[] = []

  for (const projectId of projectIds) {
    if (typeof projectId !== 'string') {
      continue
    }

    const normalizedProjectId = projectId.trim()

    if (!normalizedProjectId || seenProjectIds.has(normalizedProjectId)) {
      continue
    }

    seenProjectIds.add(normalizedProjectId)
    normalizedProjectIds.push(normalizedProjectId)
  }

  return normalizedProjectIds
}
