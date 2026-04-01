import { describe, expect, it } from 'vitest'

import {
  DEFAULT_TERMINAL_TYPOGRAPHY,
  normalizeTerminalTypography,
  readStoredTerminalTypography,
  storeTerminalTypography,
} from './terminal-preferences'

describe('terminal preferences', () => {
  it('returns the current terminal typography defaults', () => {
    expect(DEFAULT_TERMINAL_TYPOGRAPHY).toEqual({
      fontSize: 12,
      letterSpacing: -0.6,
      lineHeight: 1.22,
    })
  })

  it('normalizes unsafe values back into the supported ranges', () => {
    expect(
      normalizeTerminalTypography({
        fontSize: 99,
        letterSpacing: -99,
        lineHeight: 99,
      }),
    ).toEqual({
      fontSize: 18,
      letterSpacing: -1.2,
      lineHeight: 1.6,
    })
  })

  it('round-trips stored typography through localStorage', () => {
    localStorage.clear()

    storeTerminalTypography({
      fontSize: 14,
      letterSpacing: -0.2,
      lineHeight: 1.3,
    })

    expect(readStoredTerminalTypography()).toEqual({
      fontSize: 14,
      letterSpacing: -0.2,
      lineHeight: 1.3,
    })
  })
})
