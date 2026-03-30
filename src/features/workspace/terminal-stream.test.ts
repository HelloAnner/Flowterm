import { afterEach, describe, expect, it, vi } from 'vitest'

import type { TerminalOutputEvent } from '../../lib/contracts'
import {
  claimTerminalHistory,
  clearTerminalStream,
  publishTerminalOutput,
  subscribeTerminalOutput,
} from './terminal-stream'

const primaryEvent: TerminalOutputEvent = {
  chunk: 'pwd\n',
  paneId: 'pane-main',
  projectId: 'project-a',
  sessionId: 'session-main',
}

describe('terminal output stream', () => {
  afterEach(() => {
    clearTerminalStream('session-main')
    clearTerminalStream('session-split')
  })

  it('delivers chunks only to subscribers of the matching session', () => {
    const mainListener = vi.fn()
    const splitListener = vi.fn()
    const disposeMain = subscribeTerminalOutput('session-main', mainListener)
    const disposeSplit = subscribeTerminalOutput('session-split', splitListener)

    publishTerminalOutput(primaryEvent)

    expect(mainListener).toHaveBeenCalledWith('pwd\n')
    expect(splitListener).not.toHaveBeenCalled()

    disposeMain()
    disposeSplit()
  })

  it('stops delivering chunks after a subscriber is disposed', () => {
    const listener = vi.fn()
    const dispose = subscribeTerminalOutput('session-main', listener)

    dispose()
    publishTerminalOutput(primaryEvent)

    expect(listener).not.toHaveBeenCalled()
  })

  it('keeps accumulated history across listener gaps so remounted panes can fully recover', () => {
    const initialHistory = '$ pwd\n/Users/anner/Flowterm\n'
    const listener = vi.fn()
    const dispose = subscribeTerminalOutput('session-main', listener)

    publishTerminalOutput(primaryEvent)
    dispose()
    publishTerminalOutput({
      ...primaryEvent,
      chunk: 'echo split\n',
    })

    expect(claimTerminalHistory('session-main', initialHistory)).toBe(
      `${initialHistory}pwd\necho split\n`,
    )
  })
})
