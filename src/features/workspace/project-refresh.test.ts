import { describe, expect, it } from 'vitest'

import { shouldRefreshPreview } from './project-refresh'

describe('shouldRefreshPreview', () => {
  it('skips preview refresh for unrelated file changes', () => {
    expect(
      shouldRefreshPreview({
        changedPaths: ['README.md'],
        nextSelectedFilePath: 'src/App.tsx',
        previousSelectedFilePath: 'src/App.tsx',
      }),
    ).toBe(false)
  })

  it('refreshes preview when the selected file changes', () => {
    expect(
      shouldRefreshPreview({
        changedPaths: ['README.md'],
        nextSelectedFilePath: 'src/main.tsx',
        previousSelectedFilePath: 'src/App.tsx',
      }),
    ).toBe(true)
  })

  it('refreshes preview when the selected file is touched', () => {
    expect(
      shouldRefreshPreview({
        changedPaths: ['src/App.tsx', 'README.md'],
        nextSelectedFilePath: 'src/App.tsx',
        previousSelectedFilePath: 'src/App.tsx',
      }),
    ).toBe(true)
  })
})
