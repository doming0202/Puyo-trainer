import { useEffect, useState } from 'react'
import './SnapshotBookmark.css'

type Position = { left: number; top: number }

function findLibraryButton(): HTMLButtonElement | null {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.header-actions > button'))
    .find((button) => button.textContent?.includes('局面ライブラリ')) ?? null
}

export function SnapshotBookmark() {
  const [position, setPosition] = useState<Position | null>(null)

  useEffect(() => {
    const updatePosition = () => {
      const saveButton = document.querySelector<HTMLButtonElement>('.snapshot-form > button')
      if (!saveButton) return
      const rect = saveButton.getBoundingClientRect()
      const size = 38
      const gap = 8
      setPosition({
        left: rect.left - gap - size,
        top: rect.top + (rect.height - size) / 2,
      })
    }

    const raf = requestAnimationFrame(updatePosition)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition)
    }
  }, [])

  if (!position) return null

  return (
    <button
      type="button"
      className="snapshot-bookmark"
      title="局面ライブラリ"
      aria-label="局面ライブラリ"
      style={{ left: position.left, top: position.top }}
      onClick={() => findLibraryButton()?.click()}
    >
      🔖
    </button>
  )
}
