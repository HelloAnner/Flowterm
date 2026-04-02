import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_PREFIX = 'flowterm-sidebar-width:'

function readStoredWidth(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`)
    if (raw !== null) {
      const parsed = Number(raw)
      if (Number.isFinite(parsed) && parsed > 0) return parsed
    }
  } catch {
    // localStorage unavailable
  }
  return fallback
}

function storeWidth(key: string, width: number): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, String(Math.round(width)))
  } catch {
    // silent
  }
}

export interface SidebarResizeOptions {
  /** localStorage key — should be stable and unique per sidebar */
  storageKey: string
  /** Default width when no stored value exists */
  defaultWidth: number
  /** Minimum drag width in px */
  minWidth: number
  /** Maximum drag width in px */
  maxWidth: number
}

export interface SidebarResizeState {
  /** Current sidebar width */
  width: number
  /** Whether a drag is in progress */
  isDragging: boolean
  /** Attach this to the resize handle's onMouseDown */
  onResizeStart: (event: React.MouseEvent) => void
}

/**
 * Hook for drag-resizable sidebars with localStorage persistence.
 *
 * Usage:
 * ```tsx
 * const { width, isDragging, onResizeStart } = useSidebarResize({
 *   storageKey: 'git-sidebar',
 *   defaultWidth: 200,
 *   minWidth: 140,
 *   maxWidth: 400,
 * })
 *
 * <div style={{ width }}>sidebar</div>
 * <div className="resize-handle" onMouseDown={onResizeStart} />
 * ```
 */
export function useSidebarResize(options: SidebarResizeOptions): SidebarResizeState {
  const { storageKey, defaultWidth, minWidth, maxWidth } = options
  const [width, setWidth] = useState(() => readStoredWidth(storageKey, defaultWidth))
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const onResizeStart = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    dragRef.current = { startX: event.clientX, startWidth: width }
    setIsDragging(true)
  }, [width])

  useEffect(() => {
    if (!isDragging) return

    function handleMouseMove(event: MouseEvent): void {
      if (!dragRef.current) return
      const delta = event.clientX - dragRef.current.startX
      const next = Math.round(
        Math.max(minWidth, Math.min(maxWidth, dragRef.current.startWidth + delta)),
      )
      setWidth(next)
    }

    function handleMouseUp(): void {
      if (dragRef.current) {
        // Persist on release
        const finalWidth = Math.round(
          Math.max(minWidth, Math.min(maxWidth, width)),
        )
        storeWidth(storageKey, finalWidth)
      }
      dragRef.current = null
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    // Prevent text selection while dragging
    const prevUserSelect = document.body.style.userSelect
    const prevCursor = document.body.style.cursor
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.userSelect = prevUserSelect
      document.body.style.cursor = prevCursor
    }
  }, [isDragging, maxWidth, minWidth, storageKey, width])

  return { width, isDragging, onResizeStart }
}
