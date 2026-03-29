import type { GitStatusCode, ProjectFileEntry } from '../../lib/contracts'

export type { ProjectFileEntry }

export interface FileTreeNode {
  name: string
  path: string
  kind: 'file' | 'folder'
  children: FileTreeNode[]
  changeCount: number
  gitStatus: GitStatusCode | null
  hasLiveActivity: boolean
}

export interface ProjectSnapshotSummary {
  changedFileCount: number
  untrackedFileCount: number
  hasLiveActivity: boolean
}

export function buildFileTree(files: ProjectFileEntry[]): FileTreeNode[] {
  const root = new Map<string, FileTreeNode>()

  for (const file of files) {
    insertFileNode(root, file)
  }

  return sortNodes([...root.values()])
}

export function summarizeProjectSnapshot(
  files: ProjectFileEntry[],
): ProjectSnapshotSummary {
  return {
    changedFileCount: files.filter((file) => file.gitStatus !== ' ').length,
    untrackedFileCount: files.filter((file) => file.gitStatus === '?').length,
    hasLiveActivity: files.some((file) => file.liveStatus !== 'idle'),
  }
}

function insertFileNode(
  root: Map<string, FileTreeNode>,
  file: ProjectFileEntry,
): void {
  const segments = file.path.split('/').filter(Boolean)
  const [head, ...tail] = segments

  if (!head) {
    return
  }

  const node = root.get(head) ?? createNode(head, head, tail.length === 0 ? 'file' : 'folder')

  if (!root.has(head)) {
    root.set(head, node)
  }

  updateNode(node, head, tail, file)
}

function createNode(
  name: string,
  path: string,
  kind: FileTreeNode['kind'],
): FileTreeNode {
  return {
    name,
    path,
    kind,
    children: [],
    changeCount: 0,
    gitStatus: null,
    hasLiveActivity: false,
  }
}

function sortNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return nodes
    .map((node) => ({
      ...node,
      children: sortNodes(node.children),
    }))
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === 'folder' ? -1 : 1
      }
      return left.name.localeCompare(right.name)
    })
}

function hasChange(gitStatus: GitStatusCode): boolean {
  return gitStatus !== ' '
}

function updateNode(
  node: FileTreeNode,
  currentPath: string,
  remainingSegments: string[],
  file: ProjectFileEntry,
): void {
  if (remainingSegments.length === 0) {
    node.changeCount = hasChange(file.gitStatus) ? 1 : 0
    node.gitStatus = file.gitStatus
    node.hasLiveActivity = file.liveStatus !== 'idle'
    return
  }

  if (hasChange(file.gitStatus)) {
    node.changeCount += 1
  }
  if (file.liveStatus !== 'idle') {
    node.hasLiveActivity = true
  }

  const [head, ...tail] = remainingSegments
  const childPath = `${currentPath}/${head}`
  const existingChild = node.children.find((child) => child.name === head)
  const child =
    existingChild ??
    createNode(head, childPath, tail.length === 0 ? 'file' : 'folder')

  if (!existingChild) {
    node.children.push(child)
  }

  updateNode(child, childPath, tail, file)
}
