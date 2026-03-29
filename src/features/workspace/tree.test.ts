import { describe, expect, it } from 'vitest'

import {
  buildFileTree,
  summarizeProjectSnapshot,
  type ProjectFileEntry,
} from './tree'

const projectFiles: ProjectFileEntry[] = [
  {
    path: 'src-tauri/src/main.rs',
    kind: 'file',
    gitStatus: 'M',
    liveStatus: 'modified',
  },
  {
    path: 'src-tauri/src/lib.rs',
    kind: 'file',
    gitStatus: 'A',
    liveStatus: 'added',
  },
  {
    path: 'src/app/AppShell.tsx',
    kind: 'file',
    gitStatus: ' ',
    liveStatus: 'idle',
  },
  {
    path: 'README.md',
    kind: 'file',
    gitStatus: '?',
    liveStatus: 'idle',
  },
]

describe('buildFileTree', () => {
  it('builds nested folders and keeps folders before files', () => {
    const tree = buildFileTree(projectFiles)

    expect(tree.map((node) => node.name)).toEqual(['src', 'src-tauri', 'README.md'])
    expect(tree[1]?.children.map((child) => child.name)).toEqual(['src'])
    expect(tree[1]?.children[0]?.children.map((child) => child.name)).toEqual(['lib.rs', 'main.rs'])
  })

  it('propagates change state and live activity to parent folders', () => {
    const tree = buildFileTree(projectFiles)
    const srcTauri = tree.find((node) => node.name === 'src-tauri')
    const rustFolder = srcTauri?.children[0]

    expect(srcTauri?.changeCount).toBe(2)
    expect(srcTauri?.hasLiveActivity).toBe(true)
    expect(rustFolder?.changeCount).toBe(2)
    expect(rustFolder?.hasLiveActivity).toBe(true)
  })
})

describe('summarizeProjectSnapshot', () => {
  it('counts changed files and untracked files for tab indicators', () => {
    const summary = summarizeProjectSnapshot(projectFiles)

    expect(summary.changedFileCount).toBe(3)
    expect(summary.untrackedFileCount).toBe(1)
    expect(summary.hasLiveActivity).toBe(true)
  })
})
