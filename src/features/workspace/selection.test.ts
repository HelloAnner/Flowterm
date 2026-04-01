import { describe, expect, it } from 'vitest'

import { resolveSelectedFilePath } from './selection'
import type { ProjectFileEntry } from '../../lib/contracts'

const files: ProjectFileEntry[] = [
  {
    path: 'src',
    kind: 'folder',
    gitStatus: ' ',
    liveStatus: 'idle',
  },
  {
    path: 'README.md',
    kind: 'file',
    gitStatus: ' ',
    liveStatus: 'idle',
  },
  {
    path: 'src/App.tsx',
    kind: 'file',
    gitStatus: 'M',
    liveStatus: 'modified',
  },
]

describe('resolveSelectedFilePath', () => {
  it('keeps a clean file selected when it still exists in the snapshot', () => {
    expect(resolveSelectedFilePath(files, 'README.md')).toBe('README.md')
  })

  it('ignores a folder when restoring the current selection', () => {
    expect(resolveSelectedFilePath(files, 'src')).toBe('README.md')
  })

  it('falls back to the first file when the current selection is gone', () => {
    expect(resolveSelectedFilePath(files, 'missing.ts')).toBe('README.md')
  })
})
