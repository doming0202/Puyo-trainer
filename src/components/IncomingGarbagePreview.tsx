import { useEffect, useRef, useState } from 'react'

type PlayerPosition = { left: number; top: number }
type GarbageAttack = { target: 0 | 1; chain: number; token: number }

function garbageTierForChain(chain: number): number {
  if (chain >= 48) return 5
  if (chain >= 24) return 4
  if (chain >= 12) return 3
  if (chain >= 6) return 2
  return 1
}

export function IncomingGarbagePreview() {
  const [positions, setPositions] = useState<[PlayerPosition | null, PlayerPosition | null]>([null, null])
  const [attack, setAttack] = useState<GarbageAttack | null>(null)
  const lastChains = useRef<[number, number]>([0, 0])

  useEffect(() => {
    const updatePositions = () => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>('.player-card')).slice(0, 2)
      if (cards.length !== 2) return
      setPositions(cards.map((card) => {
        const rect = card.getBoundingClientRect()
        return { left: rect.left + rect.width / 2, top: rect.top }
      }) as [PlayerPosition, PlayerPosition])
    }

    updatePositions()
    window.addEventListener('resize', updatePositions)
    window.addEventListener('scroll', updatePositions, { passive: true })
    return () => {
      window.removeEventListener('resize', updatePositions)
      window.removeEventListener('scroll', updatePositions)
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>('.player-card')).slice(0, 2)
      if (cards.length !== 2) return

      const chains = cards.map((card) => {
        const value = Number.parseInt(card.querySelector<HTMLElement>('.combo-display strong')?.textContent ?? '0', 10)
        return Number.isFinite(value) ? value : 0
      }) as [number, number]

      for (let attacker = 0 as 0 | 1; attacker < 2; attacker = (attacker + 1) as 0 | 1) {
        if (chains[attacker] <= lastChains.current[attacker]) continue
        setAttack({ target: attacker === 0 ? 1 : 0, chain: chains[attacker], token: performance.now() })
        break
      }

      lastChains.current = chains
    }, 80)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!attack) return
    const timer = window.setTimeout(() => {
      setAttack(current => current?.token === attack.token ? null : current)
    }, 1300)
    return () => window.clearTimeout(timer)
  }, [attack])

  const position = attack ? positions[attack.target] : null
  if (!attack || !position) return null

  return (
    <div
      className="garbage-attack-preview"
      aria-label={`連鎖${attack.chain}によるおじゃま攻撃`}
      style={{ left: position.left, top: position.top - 8 }}
    >
      <span className={`garbage-attack-icon garbage-tier-${garbageTierForChain(attack.chain)}`} />
      <span className="garbage-attack-count">×{attack.chain}</span>
    </div>
  )
}
