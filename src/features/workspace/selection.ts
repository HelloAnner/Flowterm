import type { ProjectFileEntry } from '../../lib/contracts'

export function resolveSelectedFilePath(
  files: ProjectFileEntry[],
  currentSelection: string | null,
): string | null {
  const availablePaths = new Set(
    files.filter((file) => file.kind === 'file').map((file) => file.path),
  )

  if (currentSelection && availablePaths.has(currentSelection)) {
    return currentSelection
  }

  return files.find((file) => file.kind === 'file')?.path ?? null
}
