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

function countBoardGarbage(frame: ReplayFrame | undefined, playerIndex: 0 | 1): number {
  const player = frame?.players?.[playerIndex]
  if (!player) return 0
  const visible = Array.isArray(player.board)
    ? player.board.reduce((sum, row) => sum + (Array.isArray(row) ? row.filter(isGarbageCell).length : 0), 0)
    : 0
  const hidden = Array.isArray(player.hidden)
    ? player.hidden.reduce((sum, row) => sum + (Array.isArray(row) ? row.filter(isGarbageCell).length : 0), 0)
    : 0
  return visible + hidden
}

interface ActiveChain {
  maxChain: number
  attack: number
}

function numeric(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function incomingGarbageOf(player: ReplayFrame['players'][number] | undefined): number {
  if (!player) return 0
  return Math.max(0, Math.floor(numeric(player.incomingGarbage ?? player.garbage)))
}

export function buildTimelineEvents(frames: ReplayFrame[]): TimelineEvent[] {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('diagTimeline') === 'off') return []
  if (!Array.isArray(frames) || frames.length < 2) return []

  const events: TimelineEvent[] = []
  const activeChains: Array<ActiveChain | undefined> = [undefined, undefined]

  const finishChain = (playerIndex: 0 | 1, time: number, keyIndex: number): void => {
    const chain = activeChains[playerIndex]
    if (!chain) return
    const playerName = playerIndex === 0 ? 'A' : 'B'
    const maxChain = Math.max(1, Math.floor(chain.maxChain))
    const eventTime = Math.max(0, numeric(time))
    events.push({
      time: eventTime,
      label: `${playerName} ${maxChain}連鎖発生`,
      kind: 'chain',
      player: playerIndex,
      key: `${keyIndex}-chain-${playerIndex}`,
    })
    if (chain.attack > 0) {
      events.push({
        time: eventTime,
        label: `${playerName} 攻撃 +${Math.floor(chain.attack)}`,
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
    if (!previous?.players || !current?.players) continue
    const time = Math.max(0, numeric(current.elapsedMs))

    for (const playerIndex of [0, 1] as const) {
      const currentPlayer = current.players[playerIndex]
      if (!currentPlayer) continue
      const currentChain = Math.max(0, Math.floor(numeric(currentPlayer.chain)))
      if (currentChain > 0) {
        if (!activeChains[playerIndex]) {
          activeChains[playerIndex] = { maxChain: currentChain, attack: 0 }
        } else {
          activeChains[playerIndex].maxChain = Math.max(activeChains[playerIndex].maxChain, currentChain)
        }
      }
    }

    for (const targetIndex of [0, 1] as const) {
      const attackerIndex = targetIndex === 0 ? 1 : 0
      const previousIncoming = incomingGarbageOf(previous.players[targetIndex])
      const currentIncoming = incomingGarbageOf(current.players[targetIndex])
      const incomingDelta = currentIncoming - previousIncoming
      if (incomingDelta > 0 && activeChains[attackerIndex]) {
        activeChains[attackerIndex].attack += incomingDelta
      }
    }

    for (const playerIndex of [0, 1] as const) {
      const previousPlayer = previous.players[playerIndex]
      const currentPlayer = current.players[playerIndex]
      if (!previousPlayer || !currentPlayer) continue
      const previousChain = Math.max(0, Math.floor(numeric(previousPlayer.chain)))
      const currentChain = Math.max(0, Math.floor(numeric(currentPlayer.chain)))
      if (previousChain > 0 && currentChain <= 0) {
        finishChain(playerIndex, time, index)
      }
    }

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

  const lastTime = Math.max(0, numeric(frames[frames.length - 1]?.elapsedMs))
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
  const max = Math.max(1, numeric(maxTimeMs, 1))
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
  const totalSeconds = Math.max(0, numeric(ms)) / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = (totalSeconds % 60).toFixed(1).padStart(4, '0')
  return `${minutes}:${seconds}`
}
