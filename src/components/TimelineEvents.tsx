import type { ReplayFrame } from '../game/replay'
import { isGarbageCell } from '../game/types'
import './TimelineEvents.css'

type EventKind = 'chain' | 'attack' | 'drop'

export interface TimelineEvent {
  time: number
  label: string
  kind: EventKind
  player: 0 | 1
  key: string
}

function countBoardGarbage(frame: ReplayFrame, playerIndex: 0 | 1): number {
  const player = frame.players[playerIndex]
  const visible = (player.board ?? []).reduce((sum, row) => sum + (row ?? []).filter(isGarbageCell).length, 0)
  const hidden = (player.hidden ?? []).reduce((sum, row) => sum + (row ?? []).filter(isGarbageCell).length, 0)
  return visible + hidden
}

interface ActiveChain {
  maxChain: number
  attack: number
}

function incomingGarbageOf(player: ReplayFrame['players'][number]): number {
  return Math.max(0, Math.floor(player.incomingGarbage ?? player.garbage ?? 0))
}

export function buildTimelineEvents(frames: ReplayFrame[]): TimelineEvent[] {
  if (frames.length < 2) return []

  const events: TimelineEvent[] = []
  const activeChains: Array<ActiveChain | undefined> = [undefined, undefined]

  const finishChain = (playerIndex: 0 | 1, time: number, keyIndex: number): void => {
    const chain = activeChains[playerIndex]
    if (!chain) return
    const playerName = playerIndex === 0 ? 'A' : 'B'
    events.push({
      time,
      label: `${playerName} ${chain.maxChain}連鎖発生`,
      kind: 'chain',
      player: playerIndex,
      key: `${keyIndex}-chain-${playerIndex}`,
    })
    if (chain.attack > 0) {
      events.push({
        time,
        label: `${playerName} 攻撃 +${chain.attack}`,
        kind: 'attack',
        player: playerIndex,
        key: `${keyIndex}-attack-${playerIndex}`,
      })
    }
    activeChains[playerIndex] = undefined
  }

  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1]
    const current = frames[index]
    const time = Math.max(0, current.elapsedMs ?? 0)

    // 連鎖中は途中経過を表示せず、最終連鎖数だけを保持する。
    for (const playerIndex of [0, 1] as const) {
      const currentPlayer = current.players[playerIndex]
      const currentChain = Math.max(0, Math.floor(currentPlayer.chain ?? 0))
      if (currentChain > 0) {
        if (!activeChains[playerIndex]) {
          activeChains[playerIndex] = { maxChain: currentChain, attack: 0 }
        } else {
          activeChains[playerIndex].maxChain = Math.max(activeChains[playerIndex].maxChain, currentChain)
        }
      }
    }

    // 連鎖中に相手へ送られた攻撃を、その連鎖の合計へ加算する。
    for (const targetIndex of [0, 1] as const) {
      const attackerIndex = targetIndex === 0 ? 1 : 0
      const previousIncoming = incomingGarbageOf(previous.players[targetIndex])
      const currentIncoming = incomingGarbageOf(current.players[targetIndex])
      const incomingDelta = currentIncoming - previousIncoming
      if (incomingDelta > 0 && activeChains[attackerIndex]) {
        activeChains[attackerIndex].attack += incomingDelta
      }
    }

    // chain > 0 から 0 になった瞬間に、最終結果を1イベントとして確定する。
    for (const playerIndex of [0, 1] as const) {
      const previousChain = Math.max(0, Math.floor(previous.players[playerIndex].chain ?? 0))
      const currentChain = Math.max(0, Math.floor(current.players[playerIndex].chain ?? 0))
      if (previousChain > 0 && currentChain <= 0) {
        finishChain(playerIndex, time, index)
      }
    }

    // 妨害ブロックは、実際に盤面へ投入された瞬間だけ表示する。
    for (const playerIndex of [0, 1] as const) {
      const playerName = playerIndex === 0 ? 'A' : 'B'
      const boardGarbageDelta = countBoardGarbage(current, playerIndex) - countBoardGarbage(previous, playerIndex)
      if (boardGarbageDelta > 0) {
        events.push({
          time,
          label: `${playerName} おじゃま投入 ${boardGarbageDelta}`,
          kind: 'drop',
          player: playerIndex,
          key: `${index}-drop-${playerIndex}`,
        })
      }
    }
  }

  // リプレイ末尾が連鎖中でも、そこまでの最終結果を表示する。
  const lastTime = Math.max(0, frames[frames.length - 1].elapsedMs ?? 0)
  for (const playerIndex of [0, 1] as const) finishChain(playerIndex, lastTime, frames.length - 1)

  const priority: Record<EventKind, number> = { chain: 0, attack: 1, drop: 2 }
  return events.sort((a, b) => a.time - b.time || priority[a.kind] - priority[b.kind] || a.key.localeCompare(b.key))
}

interface TimelineEventsProps {
  events: TimelineEvent[]
  maxTimeMs: number
  onSeek: (time: number) => void
}

export function TimelineEvents({ events, maxTimeMs, onSeek }: TimelineEventsProps) {
  const max = Math.max(1, maxTimeMs)
  return (
    <div className="timeline-events" aria-label="タイムラインイベント">
      {events.map((event, index) => {
        const left = `${Math.min(100, Math.max(0, event.time / max * 100))}%`
        const previous = events[index - 1]
        const isClose = previous && Math.abs(event.time - previous.time) <= max * 0.045
        const lane = isClose ? (index % 2) + 1 : 0
        return (
          <button
            key={event.key}
            type="button"
            className={`timeline-event timeline-event-${event.kind}`}
            style={{ left, top: `${lane * 17}px` }}
            onClick={() => onSeek(event.time)}
            title={`${formatEventTime(event.time)} · ${event.label}`}
            aria-label={`${formatEventTime(event.time)} ${event.label}`}
          >
            <span className="timeline-event-dot" />
            <span className="timeline-event-label">{event.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function formatEventTime(ms: number): string {
  const totalSeconds = Math.max(0, ms) / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = (totalSeconds % 60).toFixed(1).padStart(4, '0')
  return `${minutes}:${seconds}`
}
