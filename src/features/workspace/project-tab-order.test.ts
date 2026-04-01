import { beforeEach, describe, expect, it } from 'vitest'

import {
  orderProjectsByTabOrder,
  readProjectTabOrder,
  reorderProjectTabOrder,
  storeProjectTabOrder,
} from './project-tab-order'

describe('project tab order', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('stores and reads the fixed project tab order', () => {
    storeProjectTabOrder(['project-a', 'project-b'])

    expect(readProjectTabOrder()).toEqual(['project-a', 'project-b'])
  })

  it('orders projects by stored tab order and appends unseen projects', () => {
    expect(
      orderProjectsByTabOrder(
        [
          { id: 'project-a', name: 'A' },
          { id: 'project-b', name: 'B' },
          { id: 'project-c', name: 'C' },
        ],
        ['project-b', 'project-a'],
      ).map((project) => project.id),
    ).toEqual(['project-b', 'project-a', 'project-c'])
  })

  it('moves a dragged project before the drop target', () => {
    expect(
      reorderProjectTabOrder(['project-a', 'project-b', 'project-c'], 'project-c', 'project-a'),
    ).toEqual(['project-c', 'project-a', 'project-b'])
  })

  it('moves a dragged project after the drop target', () => {
    expect(
      reorderProjectTabOrder(
        ['project-a', 'project-b', 'project-c'],
        'project-a',
        'project-c',
        'after',
      ),
    ).toEqual(['project-b', 'project-c', 'project-a'])
  })
})
