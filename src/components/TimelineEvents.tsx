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

interface ActiveChain {
  maxChain: number
  attack: number
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
    const time = current.elapsedMs

    // まず両プレイヤーの連鎖状態を更新する。これにより、同一フレームで
    // 連鎖開始と攻撃発生が起きても、攻撃を正しい連鎖へ合算できる。
    for (const playerIndex of [0, 1] as const) {
      const currentPlayer = current.players[playerIndex]
      if (currentPlayer.chain > 0) {
        if (!activeChains[playerIndex]) activeChains[playerIndex] = { maxChain: currentPlayer.chain, attack: 0 }
        else activeChains[playerIndex]!.maxChain = Math.max(activeChains[playerIndex]!.maxChain, currentPlayer.chain)
      }
    }

    // 連鎖中に発生した攻撃は、個別イベントにせず、その連鎖の合計へ加算する。
    for (const playerIndex of [0, 1] as const) {
      const previousPlayer = previous.players[playerIndex]
      const currentPlayer = current.players[playerIndex]
      const attackerIndex = playerIndex === 0 ? 1 : 0
      const incomingDelta = currentPlayer.incomingGarbage - previousPlayer.incomingGarbage
      if (incomingDelta > 0 && activeChains[attackerIndex]) {
        activeChains[attackerIndex]!.attack += incomingDelta
      }
    }

    // 連鎖終了時に、最終結果を1イベントとして確定する。
    for (const playerIndex of [0, 1] as const) {
      const previousPlayer = previous.players[playerIndex]
      const currentPlayer = current.players[playerIndex]
      if (previousPlayer.chain > 0 && currentPlayer.chain <= 0) {
        finishChain(playerIndex, time, index)
      }
    }

    // 妨害ブロック発生: 実際に盤面へ投入された瞬間だけ表示する。
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

  // リプレイ末尾が連鎖中の場合も、そこまでの最終結果を表示する。
  const lastTime = frames[frames.length - 1].elapsedMs
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
