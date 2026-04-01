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
  totalFileCount: number
  changedFileCount: number
  untrackedFileCount: number
  hasLiveActivity: boolean
}

export function buildFileTree(files: ProjectFileEntry[]): FileTreeNode[] {
  const root = new Map<string, FileTreeNode>()

  for (const entry of files) {
    insertTreeEntry(root, entry)
  }

  return finalizeNodes([...root.values()])
}

export function summarizeProjectSnapshot(
  files: ProjectFileEntry[],
): ProjectSnapshotSummary {
  return {
    totalFileCount: files.filter((file) => file.kind === 'file').length,
    changedFileCount: files.filter((file) => file.kind === 'file' && file.gitStatus !== ' ').length,
    untrackedFileCount: files.filter((file) => file.kind === 'file' && file.gitStatus === '?').length,
    hasLiveActivity: files.some((file) => file.liveStatus !== 'idle'),
  }
}

function insertTreeEntry(
  root: Map<string, FileTreeNode>,
  entry: ProjectFileEntry,
): void {
  const segments = entry.path.split('/').filter(Boolean)

  if (segments.length === 0) {
    return
  }

  const [head, ...tail] = segments
  const rootNode = root.get(head) ?? createNode(head, head, tail.length === 0 ? entry.kind : 'folder')

  if (!root.has(head)) {
    root.set(head, rootNode)
  }

  insertTreeEntrySegments(rootNode, head, tail, entry)
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

function finalizeNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return nodes
    .map((node) => finalizeNode(node))
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === 'folder' ? -1 : 1
      }
      return left.name.localeCompare(right.name)
    })
}

function finalizeNode(node: FileTreeNode): FileTreeNode {
  const children = finalizeNodes(node.children)

  if (node.kind === 'file') {
    return {
      ...node,
      changeCount: hasChange(node.gitStatus),
      children,
    }
  }

  return {
    ...node,
    changeCount: children.reduce((count, child) => count + child.changeCount, 0),
    children,
    gitStatus: null,
    hasLiveActivity: node.hasLiveActivity || children.some((child) => child.hasLiveActivity),
  }
}

function insertTreeEntrySegments(
  node: FileTreeNode,
  currentPath: string,
  remainingSegments: string[],
  entry: ProjectFileEntry,
): void {
  if (remainingSegments.length === 0) {
    applyLeafState(node, entry)
    return
  }

  const [head, ...tail] = remainingSegments
  const childPath = `${currentPath}/${head}`
  const isLeaf = tail.length === 0
  const childKind = isLeaf ? entry.kind : 'folder'
  const existingChild = node.children.find((child) => child.name === head)
  const child = existingChild ?? createNode(head, childPath, childKind)

  if (!existingChild) {
    node.children.push(child)
  } else if (childKind === 'folder') {
    existingChild.kind = 'folder'
  }

  insertTreeEntrySegments(child, childPath, tail, entry)
}

function applyLeafState(
  node: FileTreeNode,
  entry: ProjectFileEntry,
): void {
  node.hasLiveActivity = entry.liveStatus !== 'idle'

  if (entry.kind === 'folder') {
    node.gitStatus = null
    return
  }

  node.gitStatus = entry.gitStatus
}

function hasChange(gitStatus: GitStatusCode | null): number {
  if (!gitStatus || gitStatus === ' ') {
    return 0
  }

  return 1
}
