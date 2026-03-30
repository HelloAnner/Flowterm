import { describe, expect, it } from 'vitest'

import { toggleExpandedPath } from './tree-expansion'

describe('toggleExpandedPath', () => {
  it('adds a path when expanding a folder', () => {
    expect(toggleExpandedPath({}, 'src', true)).toEqual({ src: true })
  })

  it('removes a path when collapsing a folder', () => {
    expect(toggleExpandedPath({ src: true }, 'src', false)).toEqual({})
  })

  it('preserves other expanded folders', () => {
    expect(toggleExpandedPath({ docs: true, src: true }, 'src', false)).toEqual({
      docs: true,
    })
  })
})
