import { useEffect, useState } from 'react'
import { decreaseFallSpeed, getFallSpeedMultiplier, increaseFallSpeed, subscribeFallSpeed } from '../game/fall-speed'
import { formatKeyCode, loadKeybinds } from '../game/keybinds'
import { IncomingGarbagePreview } from './IncomingGarbagePreview'

function firstOrFallback(codes: string[], fallback: string): string {
  return codes.find(Boolean) ?? fallback
}

function preferredCode(codes: string[], preferred: string): string {
  return codes.includes(preferred) ? preferred : firstOrFallback(codes, preferred)
}

export function FallSpeedControl() {
  const [speed, setSpeed] = useState(getFallSpeedMultiplier())
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const [keyLabels, setKeyLabels] = useState(() => {
    const keybinds = loadKeybinds()
    return {
      faster: formatKeyCode(preferredCode(keybinds['hard-drop'], 'ArrowUp')),
      slower: formatKeyCode(preferredCode(keybinds['soft-drop'], 'ArrowDown')),
    }
  })

  useEffect(() => subscribeFallSpeed(setSpeed), [])

  useEffect(() => {
    const updatePosition = () => {
      const anchor = document.querySelector<HTMLElement>('.vs')
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      setPosition({ left: rect.left + rect.width / 2, top: rect.top + 185 })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, { passive: true })

    let observer: ResizeObserver | undefined
    const anchor = document.querySelector<HTMLElement>('.vs')
    if (anchor && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(updatePosition)
      observer.observe(anchor)
    }

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition)
      observer?.disconnect()
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || !event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return

      const keybinds = loadKeybinds()
      const faster = keybinds['hard-drop'].includes(event.code)
      const slower = keybinds['soft-drop'].includes(event.code)
      if (!faster && !slower) return

      event.preventDefault()
      if (faster) increaseFallSpeed()
      if (slower) decreaseFallSpeed()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const updateLabels = () => {
      const keybinds = loadKeybinds()
      setKeyLabels({
        faster: formatKeyCode(preferredCode(keybinds['hard-drop'], 'ArrowUp')),
        slower: formatKeyCode(preferredCode(keybinds['soft-drop'], 'ArrowDown')),
      })
    }
    window.addEventListener('storage', updateLabels)
    return () => window.removeEventListener('storage', updateLabels)
  }, [])

  if (!position) return <IncomingGarbagePreview />

  return (
    <>
      <div
        className="fall-speed-control"
        aria-label="落下速度"
        style={{ left: position.left, top: position.top }}
      >
        <div className="fall-speed-label">落下速度</div>
        <strong>{speed.toFixed(1)}×</strong>
        <span>Shift + {keyLabels.faster} 速く</span>
        <span>Shift + {keyLabels.slower} 遅く</span>
        <small>0.2× ～ 2.0×</small>
      </div>
      <IncomingGarbagePreview />
    </>
  )
}
