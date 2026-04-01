const PROJECT_TAB_ORDER_STORAGE_KEY = 'flowterm:project-tab-order'

interface ProjectIdentity {
  id: string
}

export function readProjectTabOrder(): string[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const rawValue = window.localStorage.getItem(PROJECT_TAB_ORDER_STORAGE_KEY)

    if (!rawValue) {
      return []
    }

    const parsed = JSON.parse(rawValue)

    if (!Array.isArray(parsed)) {
      return []
    }

    return normalizeProjectIds(parsed)
  } catch {
    return []
  }
}

export function storeProjectTabOrder(projectIds: string[]): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(
      PROJECT_TAB_ORDER_STORAGE_KEY,
      JSON.stringify(normalizeProjectIds(projectIds)),
    )
  } catch {
    return
  }
}

export function orderProjectsByTabOrder<Project extends ProjectIdentity>(
  projects: Project[],
  tabOrderProjectIds: string[],
): Project[] {
  const projectsById = new Map(projects.map((project) => [project.id, project]))
  const orderedProjects: Project[] = []

  for (const projectId of normalizeProjectIds(tabOrderProjectIds)) {
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

export function reorderProjectTabOrder(
  projectIds: string[],
  draggedProjectId: string,
  targetProjectId: string,
  position: 'after' | 'before' = 'before',
): string[] {
  const normalizedProjectIds = normalizeProjectIds(projectIds)
  const draggedIndex = normalizedProjectIds.indexOf(draggedProjectId)
  const targetIndex = normalizedProjectIds.indexOf(targetProjectId)

  if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) {
    return normalizedProjectIds
  }

  const nextProjectIds = [...normalizedProjectIds]
  const [draggedProject] = nextProjectIds.splice(draggedIndex, 1)
  const adjustedTargetIndex = nextProjectIds.indexOf(targetProjectId)
  const insertionIndex =
    position === 'after'
      ? adjustedTargetIndex + 1
      : adjustedTargetIndex

  nextProjectIds.splice(insertionIndex, 0, draggedProject)

  return nextProjectIds
}

function normalizeProjectIds(projectIds: unknown[]): string[] {
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
