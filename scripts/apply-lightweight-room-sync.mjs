import { readFileSync, writeFileSync } from 'node:fs'

function patch(path, transform) {
  const before = readFileSync(path, 'utf8')
  const after = transform(before)
  if (after === before) throw new Error(`No changes made to ${path}`)
  writeFileSync(path, after, 'utf8')
}

function replaceExact(text, oldText, newText, label) {
  const count = text.split(oldText).length - 1
  if (count !== 1) throw new Error(`${label}: expected 1 match, got ${count}`)
  return text.replace(oldText, newText)
}

patch('src/game/room-client.ts', text => {
  text = replaceExact(
    text,
    "import type { GameState } from './types'\n",
    "import type { GameState, TurnState } from './types'\n",
    'room-client import',
  )
  text = replaceExact(
    text,
    `export interface SharedRoomLiveState {\n  game: GameState\n  elapsedMs: number\n  cursorElapsedMs: number\n  playing: boolean\n  speed: number\n}\n`,
    `export interface SharedRoomLiveState {\n  elapsedMs: number\n  cursorElapsedMs: number\n  playing: boolean\n  speed: number\n}\n\nexport type RoomPlayerState = TurnState\n\nexport interface RoomPlayerStateSync {\n  playerIndex: 0 | 1\n  player: RoomPlayerState\n  tick: number\n  activePlayer: 0 | 1\n  running: boolean\n  elapsedMs: number\n}\n`,
    'room-client live state type',
  )
  text = replaceExact(
    text,
    "  | { type: 'live-state'; state: SharedRoomLiveState }\n",
    "  | { type: 'live-state'; state: SharedRoomLiveState }\n  | { type: 'player-state'; state: RoomPlayerStateSync }\n",
    'room-client message type',
  )
  text = replaceExact(
    text,
    `  sendLiveState(state: SharedRoomLiveState): void {\n    if (this._role !== 'coach') return\n    this.send({ type: 'live-state', state })\n  }\n`,
    `  sendLiveState(state: SharedRoomLiveState): void {\n    if (this._role !== 'coach') return\n    this.send({ type: 'live-state', state })\n  }\n\n  sendPlayerState(state: RoomPlayerStateSync): void {\n    if (this._role !== 'coach') return\n    this.send({ type: 'player-state', state })\n  }\n`,
    'room-client sender',
  )
  return text
})

patch('src/App.tsx', text => {
  text = replaceExact(
    text,
    "import type { RoomFocusState, SharedRoomLiveState, SharedRoomState } from './game/room-client'\n",
    "import type { RoomFocusState, RoomPlayerStateSync, SharedRoomLiveState, SharedRoomState } from './game/room-client'\n",
    'App room import',
  )
  text = replaceExact(
    text,
    "import { COLS, ROWS, type Board, type GameState, type PlayerState, type PuyoColor } from './game/types'\n",
    "import { COLS, ROWS, type Board, type GameState, type PlayerState, type PuyoColor } from './game/types'\nimport { generatePuyoSequence } from './game/puyo-sequence'\n",
    'App sequence import',
  )

  const liveStart = text.indexOf("  const applyRemoteRoomLiveState = useCallback((state: SharedRoomLiveState) => {\n")
  if (liveStart < 0) throw new Error('App live state start not found')
  const liveEnd = text.indexOf("  }, [resetClock])\n", liveStart)
  if (liveEnd < 0) throw new Error('App live state end not found')
  const liveBlock = `  const applyRemoteRoomLiveState = useCallback((state: SharedRoomLiveState) => {\n    const currentReplay = replayRef.current\n    const cursorElapsed = Math.max(0, state.cursorElapsedMs)\n    const cursor = findFrameAtElapsed(currentReplay.frames, cursorElapsed)\n    const frame = currentReplay.frames[cursor]\n    const nextReplay: ReplayState = { ...currentReplay, cursor, playing: state.playing, speed: state.speed }\n    if (frame) {\n      const nextGame = frameToGame(frame, false)\n      gameRef.current = nextGame\n      setGame(nextGame)\n    }\n    replayRef.current = nextReplay\n    setReplay(nextReplay)\n    resetClock(state.elapsedMs)\n  }, [resetClock])\n\n  const applyRemoteRoomPlayerState = useCallback((state: RoomPlayerStateSync) => {\n    const current = gameRef.current\n    if (state.tick < current.tick) return\n    const currentPlayer = current.players[state.playerIndex]\n    const nextPlayer: PlayerState = {\n      ...currentPlayer,\n      ...state.player,\n      puyoSequence: state.player.puyoSequence,\n    }\n    const players = [...current.players] as [PlayerState, PlayerState]\n    players[state.playerIndex] = nextPlayer\n    const nextGame = {\n      ...current,\n      players,\n      activePlayer: state.activePlayer,\n      running: state.running,\n      tick: state.tick,\n    }\n    gameRef.current = nextGame\n    setGame(nextGame)\n    resetClock(state.elapsedMs)\n  }, [resetClock])\n`
  text = text.slice(0, liveStart) + liveBlock + text.slice(liveEnd + "  }, [resetClock])\n".length)

  // Add a RoomClient -> App bridge for the small player-state packets.
  const bridgeAnchor = "  useEffect(() => {\n    const onFocusState = (event: Event) => {\n"
  const bridgeIndex = text.indexOf(bridgeAnchor)
  if (bridgeIndex < 0) throw new Error('App focus effect anchor not found')
  const bridge = `  useEffect(() => {\n    const onPlayerState = (event: Event) => {\n      const state = (event as CustomEvent<RoomPlayerStateSync>).detail\n      if (!state || (state.playerIndex !== 0 && state.playerIndex !== 1)) return\n      applyRemoteRoomPlayerState(state)\n    }\n    window.addEventListener('puyo-room-player-state', onPlayerState)\n    return () => window.removeEventListener('puyo-room-player-state', onPlayerState)\n  }, [applyRemoteRoomPlayerState])\n\n`
  text = text.slice(0, bridgeIndex) + bridge + text.slice(bridgeIndex)

  // Coach responds to a remote student action by publishing the authoritative player state.
  text = replaceExact(
    text,
    "      window.dispatchEvent(new Event('puyo-room-state-changed'))\n    }\n    window.addEventListener('puyo-room-student-action', onStudentAction)\n",
    "      window.dispatchEvent(new CustomEvent('puyo-room-local-action', { detail: { playerIndex: detail.playerIndex, action: detail.action } }))\n    }\n    window.addEventListener('puyo-room-student-action', onStudentAction)\n",
    'App student action response',
  )
  return text
})

patch('src/components/RoomPanel.tsx', text => {
  text = replaceExact(
    text,
    "import type { RoomAction, SharedRoomLiveState, SharedRoomState, RoomRole, RoomFocusState } from '../game/room-client'\n",
    "import type { RoomAction, RoomPlayerState, RoomPlayerStateSync, SharedRoomLiveState, SharedRoomState, RoomRole, RoomFocusState } from '../game/room-client'\n",
    'RoomPanel import',
  )
  text = replaceExact(text, 'const LIVE_INTERVAL_MS = 150\n', 'const LIVE_INTERVAL_MS = 500\n', 'RoomPanel interval')

  const helperAnchor = "function dispatchFocusState(focus: RoomFocusState | null, memberId: string | null, connected: boolean): void {\n"
  const helperIndex = text.indexOf(helperAnchor)
  if (helperIndex < 0) throw new Error('RoomPanel helper anchor not found')
  const helper = `function compactPlayerState(player: GameState['players'][number]): RoomPlayerState {\n  const { turnStart: _turnStart, undoStack: _undoStack, redoStack: _redoStack, ...state } = player\n  return structuredClone(state)\n}\n\n`
  text = text.slice(0, helperIndex) + helper + text.slice(helperIndex)

  const messageAnchor = "      } else if (message.type === 'live-state') {\n        if (message.state && client.role === 'student' && followCoachRef.current) onRemoteLiveState(message.state)\n"
  text = replaceExact(
    text,
    messageAnchor,
    messageAnchor + "      } else if (message.type === 'player-state') {\n        window.dispatchEvent(new CustomEvent('puyo-room-player-state', { detail: message.state }))\n",
    'RoomPanel message bridge',
  )

  const localActionOld = `    const onLocalAction = (event: Event) => {\n      const detail = (event as CustomEvent<{ playerIndex: 0 | 1; action: RoomAction }>).detail\n      if (!detail || (detail.playerIndex !== 0 && detail.playerIndex !== 1) || typeof detail.action !== 'string') return\n      if (client.role === 'student' && client.focus[detail.playerIndex] === client.memberId) {\n        client.sendAction(detail.playerIndex, detail.action)\n      }\n    }\n`
  const localActionNew = `    const onLocalAction = (event: Event) => {\n      const detail = (event as CustomEvent<{ playerIndex: 0 | 1; action: RoomAction }>).detail\n      if (!detail || (detail.playerIndex !== 0 && detail.playerIndex !== 1) || typeof detail.action !== 'string') return\n      if (client.role === 'student') {\n        if (client.focus[detail.playerIndex] === client.memberId) client.sendAction(detail.playerIndex, detail.action)\n        return\n      }\n      if (client.role === 'coach') {\n        const currentGame = gameRef.current\n        client.sendPlayerState({\n          playerIndex: detail.playerIndex,\n          player: compactPlayerState(currentGame.players[detail.playerIndex]),\n          tick: currentGame.tick,\n          activePlayer: currentGame.activePlayer,\n          running: currentGame.running,\n          elapsedMs: timelineRef.current,\n        })\n      }\n    }\n`
  text = replaceExact(text, localActionOld, localActionNew, 'RoomPanel local action')

  const liveOld = `      client.sendLiveState({\n        game: compactGame(gameRef.current),\n        elapsedMs: currentElapsed,\n        cursorElapsedMs: currentReplay.frames[currentReplay.cursor]?.elapsedMs ?? currentElapsed,\n        playing: currentReplay.playing,\n        speed: currentReplay.speed,\n      })\n`
  const liveNew = `      client.sendLiveState({\n        elapsedMs: currentElapsed,\n        cursorElapsedMs: currentReplay.frames[currentReplay.cursor]?.elapsedMs ?? currentElapsed,\n        playing: currentReplay.playing,\n        speed: currentReplay.speed,\n      })\n      for (const playerIndex of [0, 1]) {\n        client.sendPlayerState({\n          playerIndex,\n          player: compactPlayerState(gameRef.current.players[playerIndex]),\n          tick: gameRef.current.tick,\n          activePlayer: gameRef.current.activePlayer,\n          running: gameRef.current.running,\n          elapsedMs: currentElapsed,\n        })\n      }\n`
  text = replaceExact(text, liveOld, liveNew, 'RoomPanel live sync')
  return text
})

patch('server/room-server.mjs', text => {
  const marker = "  if (message.type === 'live-state' && member.role === 'coach') {\n"
  if (!text.includes(marker)) throw new Error('server live-state anchor not found')
  const block = `  if (message.type === 'player-state' && member.role === 'coach') {\n    const state = message.state\n    if (!state || typeof state !== 'object') return\n    const playerIndex = Number(state.playerIndex)\n    if (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return\n    if (!state.player || typeof state.player !== 'object') return\n\n    if (room.state?.game?.players?.[playerIndex]) {\n      const currentPlayer = room.state.game.players[playerIndex]\n      room.state = {\n        ...room.state,\n        game: {\n          ...room.state.game,\n          players: [\n            playerIndex === 0 ? { ...currentPlayer, ...state.player } : room.state.game.players[0],\n            playerIndex === 1 ? { ...currentPlayer, ...state.player } : room.state.game.players[1],\n          ],\n          activePlayer: state.activePlayer === 1 ? 1 : 0,\n          running: Boolean(state.running),\n          tick: Number.isFinite(state.tick) ? Math.max(room.state.game.tick, state.tick) : room.state.game.tick,\n        },\n        elapsedMs: Number.isFinite(state.elapsedMs) ? Math.max(0, state.elapsedMs) : room.state.elapsedMs,\n      }\n    }\n\n    broadcast(room, { type: 'player-state', state }, socket)\n    return\n  }\n\n`
  return text.replace(marker, block + marker)
})

console.log('Lightweight room synchronization patch applied')
