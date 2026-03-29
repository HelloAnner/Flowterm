import type { ProjectFileEntry } from '../../lib/contracts'

export function resolveSelectedFilePath(
  files: ProjectFileEntry[],
  currentSelection: string | null,
): string | null {
  const availablePaths = new Set(files.map((file) => file.path))

  if (currentSelection && availablePaths.has(currentSelection)) {
    return currentSelection
  }

  return files[0]?.path ?? null
}
