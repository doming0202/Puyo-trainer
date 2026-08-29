import { getGarbageTierForCount } from '../game/engine'

type IncomingGarbageViewProps = {
  count: number
}

export function IncomingGarbageView({ count }: IncomingGarbageViewProps) {
  const incoming = Math.max(0, Math.floor(count))
  if (incoming === 0) return null

  const tier = getGarbageTierForCount(incoming)
  const iconCount = Math.min(4, Math.max(1, Math.ceil(incoming / 6)))

  return (
    <div className="incoming-garbage-panel" aria-label={`受信待ちおじゃま ${incoming} 個`}>
      <span className="incoming-garbage-label">INCOMING</span>
      <div className="incoming-garbage-icons" aria-hidden="true">
        {Array.from({ length: iconCount }, (_, index) => (
          <span key={index} className={`garbage-attack-icon garbage-tier-${tier}`} />
        ))}
      </div>
      <strong>×{incoming}</strong>
    </div>
  )
}
