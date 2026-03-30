export function toggleExpandedPath(
  expandedPaths: Record<string, boolean>,
  path: string,
  expanded: boolean,
): Record<string, boolean> {
  if (expanded) {
    if (expandedPaths[path]) {
      return expandedPaths
    }

    return {
      ...expandedPaths,
      [path]: true,
    }
  }

  if (!(path in expandedPaths)) {
    return expandedPaths
  }

  const nextExpandedPaths = { ...expandedPaths }
  delete nextExpandedPaths[path]
  return nextExpandedPaths
}
