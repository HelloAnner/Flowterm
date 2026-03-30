interface ShouldRefreshPreviewInput {
  changedPaths?: string[]
  nextSelectedFilePath: string | null
  previousSelectedFilePath: string | null
}

export function shouldRefreshPreview({
  changedPaths,
  nextSelectedFilePath,
  previousSelectedFilePath,
}: ShouldRefreshPreviewInput): boolean {
  if (!nextSelectedFilePath) {
    return false
  }

  if (previousSelectedFilePath !== nextSelectedFilePath) {
    return true
  }

  if (!changedPaths || changedPaths.length === 0) {
    return true
  }

  return changedPaths.some((changedPath) =>
    pathTouchesSelection(changedPath, nextSelectedFilePath),
  )
}

function pathTouchesSelection(changedPath: string, selectedFilePath: string): boolean {
  const normalizedChangedPath = normalizePath(changedPath)
  const normalizedSelectedFilePath = normalizePath(selectedFilePath)

  return (
    normalizedChangedPath === normalizedSelectedFilePath ||
    normalizedChangedPath.startsWith(`${normalizedSelectedFilePath}/`) ||
    normalizedSelectedFilePath.startsWith(`${normalizedChangedPath}/`)
  )
}

function normalizePath(path: string): string {
  return path.replace(/^\/+|\/+$/g, '')
}
