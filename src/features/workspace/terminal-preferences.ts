export interface TerminalTypography {
  fontSize: number
  letterSpacing: number
  lineHeight: number
}

export const DEFAULT_TERMINAL_TYPOGRAPHY: TerminalTypography = {
  fontSize: 13,
  letterSpacing: -0.3,
  lineHeight: 1.25,
}

export const TERMINAL_TYPOGRAPHY_STORAGE_KEY = 'flowterm.terminal-typography'

export function normalizeTerminalTypography(
  value: Partial<TerminalTypography> | null | undefined,
): TerminalTypography {
  return {
    fontSize: clampNumber(value?.fontSize, 11, 18, DEFAULT_TERMINAL_TYPOGRAPHY.fontSize, 0),
    letterSpacing: clampNumber(
      value?.letterSpacing,
      -1.2,
      0.5,
      DEFAULT_TERMINAL_TYPOGRAPHY.letterSpacing,
      1,
    ),
    lineHeight: clampNumber(
      value?.lineHeight,
      1.05,
      1.6,
      DEFAULT_TERMINAL_TYPOGRAPHY.lineHeight,
      2,
    ),
  }
}

export function readStoredTerminalTypography(): TerminalTypography {
  if (typeof window === 'undefined') {
    return DEFAULT_TERMINAL_TYPOGRAPHY
  }

  const rawValue = window.localStorage.getItem(TERMINAL_TYPOGRAPHY_STORAGE_KEY)

  if (!rawValue) {
    return DEFAULT_TERMINAL_TYPOGRAPHY
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<TerminalTypography>
    return normalizeTerminalTypography(parsed)
  } catch {
    return DEFAULT_TERMINAL_TYPOGRAPHY
  }
}

export function storeTerminalTypography(value: Partial<TerminalTypography>): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(
    TERMINAL_TYPOGRAPHY_STORAGE_KEY,
    JSON.stringify(normalizeTerminalTypography(value)),
  )
}

function clampNumber(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
  decimals: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  const safeValue = Math.min(max, Math.max(min, value))
  const multiplier = 10 ** decimals

  return Math.round(safeValue * multiplier) / multiplier
}
