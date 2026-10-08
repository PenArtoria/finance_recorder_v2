import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

/**
 * Fixed-position style that keeps a dropdown attached to its input, even inside a
 * scrolling dialog. Opens upward when there isn't room below.
 */
export function useAnchoredStyle(anchor: RefObject<HTMLElement | null>, open: boolean, maxHeight = 280): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({ position: 'fixed', visibility: 'hidden' })
  useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      const el = anchor.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const below = window.innerHeight - r.bottom - 16
      const above = r.top - 16
      const up = below < Math.min(maxHeight, 220) && above > below
      setStyle({
        position: 'fixed',
        left: r.left,
        width: r.width,
        maxHeight: Math.max(120, Math.min(maxHeight, up ? above : below)),
        top: up ? 'auto' : r.bottom + 6,
        bottom: up ? window.innerHeight - r.top + 6 : 'auto'
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, anchor, maxHeight])
  return style
}
