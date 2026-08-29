import type { ReplayFrame } from '../game/replay'
import { isGarbageCell } from '../game/types'
import './TimelineEvents.css'

type EventKind = 'chain' | 'attack' | 'cancel' | 'drop'

export interface TimelineEvent {
  time: number
  label: string
  kind: EventKind
  player: 0 | 1
  key: string
}

function countBoardGarbage(frame: ReplayFrame, playerIndex: 0 | 1): number {
  const player = frame.players[playerIndex]
  const visible = player.board.reduce((sum, row) => sum + row.filter(isGarbageCell).length, 0)
  const hidden = player.hidden.reduce((sum, row) => sum + row.filter(isGarbageCell).length, 0)
  return visible + hidden
}

export function buildTimelineEvents(frames: ReplayFrame[]): TimelineEvent[] {
  if (frames.length < 2) return []

  const events: TimelineEvent[] = []
  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1]
    const current = frames[index]
    const time = current.elapsedMs

    for (const playerIndex of [0, 1] as const) {
      const previousPlayer = previous.players[playerIndex]
      const currentPlayer = current.players[playerIndex]
      const playerName = playerIndex === 0 ? 'A' : 'B'
      const opponentName = playerIndex === 0 ? 'B' : 'A'

      if (currentPlayer.chain > previousPlayer.chain) {
        events.push({
          time,
          label: `${playerName} ${currentPlayer.chain}連鎖発生`,
          kind: 'chain',
          player: playerIndex,
          key: `${index}-chain-${playerIndex}`,
        })
      }

      const incomingDelta = currentPlayer.incomingGarbage - previousPlayer.incomingGarbage
      const boardGarbageDelta = countBoardGarbage(current, playerIndex) - countBoardGarbage(previous, playerIndex)

      if (incomingDelta > 0) {
        events.push({
          time,
          label: `${opponentName} 攻撃 +${incomingDelta}`,
          kind: 'attack',
          player: playerIndex === 0 ? 1 : 0,
          key: `${index}-attack-${playerIndex}`,
        })
      } else if (incomingDelta < 0 && boardGarbageDelta <= 0) {
        events.push({
          time,
          label: `${playerName} 相殺 -${Math.abs(incomingDelta)}`,
          kind: 'cancel',
          player: playerIndex,
          key: `${index}-cancel-${playerIndex}`,
        })
      }

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

  return events.sort((a, b) => a.time - b.time || a.key.localeCompare(b.key))
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
