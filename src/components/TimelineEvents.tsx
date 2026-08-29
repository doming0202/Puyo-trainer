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
  const visible = player.board.reduce((sum, row) => sum + row.filter(isGarbageCell).length, 0)
  const hidden = player.hidden.reduce((sum, row) => sum + row.filter(isGarbageCell).length, 0)
  return visible + hidden
}

export function buildTimelineEvents(frames: ReplayFrame[]): TimelineEvent[] {
  if (frames.length < 2) return []

  const events: TimelineEvent[] = []
  const chainCounts: [number, number] = [0, 0]

  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1]
    const current = frames[index]
    const time = current.elapsedMs

    for (const playerIndex of [0, 1] as const) {
      const previousPlayer = previous.players[playerIndex]
      const currentPlayer = current.players[playerIndex]
      const playerName = playerIndex === 0 ? 'A' : 'B'
      const opponentName = playerIndex === 0 ? 'B' : 'A'

      // 連鎖: 新しい連鎖が開始した瞬間に1回だけ記録し、表示は累計連鎖数のみ。
      if (currentPlayer.chain > 0 && previousPlayer.chain <= 0) {
        chainCounts[playerIndex] += 1
        events.push({
          time,
          label: `${playerName} 連鎖累計 ${chainCounts[playerIndex]}`,
          kind: 'chain',
          player: playerIndex,
          key: `${index}-chain-${playerIndex}`,
        })
      }

      // 攻撃: 相手側の受信おじゃまが増えた瞬間を、攻撃した側のイベントとして表示する。
      const incomingDelta = currentPlayer.incomingGarbage - previousPlayer.incomingGarbage
      if (incomingDelta > 0) {
        events.push({
          time,
          label: `${opponentName} 攻撃 +${incomingDelta}`,
          kind: 'attack',
          player: playerIndex === 0 ? 1 : 0,
          key: `${index}-attack-${playerIndex}`,
        })
      }

      // 妨害ブロック発生: 実際に盤面へ投入された瞬間だけ表示する。
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
