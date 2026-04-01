import { beforeEach, describe, expect, it } from 'vitest'

import {
  bumpProjectToFront,
  orderProjectsByRecency,
  readRecentProjectIds,
  storeRecentProjectIds,
} from './project-recents'

describe('project recents', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('stores and reads recent project ids in order', () => {
    storeRecentProjectIds(['project-b', 'project-a'])

    expect(readRecentProjectIds()).toEqual(['project-b', 'project-a'])
  })

  it('moves the active project to the front without duplicating ids', () => {
    expect(
      bumpProjectToFront(['project-b', 'project-a', 'project-b'], 'project-c'),
    ).toEqual(['project-c', 'project-b', 'project-a'])
  })

  it('orders projects by recency and appends unseen projects', () => {
    expect(
      orderProjectsByRecency(
        [
          { id: 'project-a', name: 'A' },
          { id: 'project-b', name: 'B' },
          { id: 'project-c', name: 'C' },
        ],
        ['project-b', 'project-a'],
      ).map((project) => project.id),
    ).toEqual(['project-b', 'project-a', 'project-c'])
  })
})
