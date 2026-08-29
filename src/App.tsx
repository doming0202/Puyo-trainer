import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { advancePlayer, advanceResolution, cellsOf, createGame, updatePlayer } from './game/engine'
import { EDITABLE_COLORS, setGarbage, setNextPair, setPairColors, setPairRotation } from './game/editor'
import { appendFrame, captureFrame, clonePlayer, createReplay, findFrameAtElapsed, frameToGame, REPLAY_SPEEDS, type ReplayState } from './game/replay'
import { cloneGameState, deleteSnapshot, listSnapshots, makeSnapshot, saveSnapshot, type Snapshot } from './game/snapshots'
import { loadKeybinds, saveKeybinds, type GameplayAction, type Keybinds } from './game/keybinds'
import { COLS, ROWS, type Board, type GameState, type PlayerState, type PuyoColor } from './game/types'
import type { RoomFocusState, SharedRoomLiveState, SharedRoomState } from './game/room-client'
import { DirectBoardEditor } from './components/DirectBoardEditor'
import { IncomingGarbageView } from './components/IncomingGarbageView'
import { KeybindModal } from './components/KeybindModal'
import { RoomPanel } from './components/RoomPanel'
import { buildTimelineEvents, TimelineEvents } from './components/TimelineEvents'
import './styles.css'

type PairEdit = { axis: PuyoColor; child: PuyoColor }
type EditControls = {
  changeCurrentColor: (part: 'axis' | 'child') => void
  rotateCurrent: (delta: 1 | -1) => void
  changeNext: (index: number, part: 'axis' | 'child') => void
  changeGarbage: (delta: number) => void
  setGarbageValue: (value: string) => void
}
type TurnCopyBackup = {
  game: GameState
  replay: ReplayState
  elapsedMs: number
}
type TimelineSeekDetail = {
  mode: 'time' | 'cursor'
  value: number
}
type RoomFocusStateDetail = {
  focus: RoomFocusState | null
  memberId: string | null
  connected: boolean
}
type RoomFocusResultDetail = {
  playerIndex: 0 | 1
  reason?: string
  ownerRole?: 'coach' | 'student' | null
}

const COLOR_MAP: Record<PuyoColor, string> = { 1: '#ff5b68', 2: '#5aa7ff', 3: '#58d68d', 4: '#b66cff' }
const COLOR_NAMES: Record<PuyoColor, string> = { 1: '赤', 2: '青', 3: '緑', 4: '紫' }

function garbageTierClass(color: PuyoColor): string {
  const value = color as number
  if (value < 5) return ''
  const tier = Math.min(5, Math.max(1, value - 4))
  return `garbage-puyo garbage-tier-${tier}`
}

function seekTime(elapsedMs: number): void {
  window.dispatchEvent(new CustomEvent<TimelineSeekDetail>('puyo-timeline-seek', { detail: { mode: 'time', value: elapsedMs } }))
}

function seek(cursor: number): void {
  window.dispatchEvent(new CustomEvent<TimelineSeekDetail>('puyo-timeline-seek', { detail: { mode: 'cursor', value: cursor } }))
}

function cloneReplayState(replay: ReplayState): ReplayState {
  return {
    ...replay,
    frames: replay.frames.map((frame) => ({
      ...frame,
      players: [clonePlayer(frame.players[0]), clonePlayer(frame.players[1])],
    } as typeof frame)),
  }
}

function BoardView({ player, editMode, focused, onFocus, onBoardChange, onPairEdit }: { player: PlayerState; editMode: boolean; focused: boolean; onFocus: () => void; onBoardChange: (board: Board) => void; onPairEdit: (pair: PairEdit) => void }) {
  const active = player.resolution ? new Map<string, PuyoColor>() : new Map(cellsOf(player.current).map((cell) => [`${cell.x},${cell.y}`, cell.color]))
  const clearing = new Set((player.resolution?.pendingGroups ?? []).flatMap((group) => group.map(({ x, y }) => `${x},${y}`)))
  const falling = new Map((player.resolution?.fallingCells ?? []).map((cell) => [`${cell.x},${cell.y}`, cell]))

  return <div className="board-stage"><div className="board-wrap"><IncomingGarbageView count={player.incomingGarbage} /><div className="board" aria-label="ゲーム盤面" onMouseDown={onFocus} style={focused ? { boxShadow: '0 0 0 2px rgba(143,215,255,.65), 0 0 24px rgba(143,215,255,.12)' } : undefined}>{Array.from({ length: ROWS * COLS }, (_, index) => {
    const x = index % COLS
    const y = Math.floor(index / COLS)
    const key = `${x},${y}`
    const color = active.get(key) ?? player.board[y][x]
    const fallingCell = falling.get(key)
    const puyoStyle = color ? ({
      background: COLOR_MAP[color],
      ...(fallingCell ? { '--fall-offset': `${(fallingCell.fromY - y) * 40}px` } : {}),
    } as CSSProperties & Record<'--fall-offset', string>) : undefined
    return <div className={`cell ${clearing.has(key) ? 'clearing-cell' : ''}`} key={key}>
      {color && <span className={`puyo ${garbageTierClass(color)} ${fallingCell ? 'falling-puyo' : ''}`} style={puyoStyle} />}
    </div>
  })}</div>{editMode && <DirectBoardEditor board={player.board} onBoardChange={onBoardChange} onPairEdit={onPairEdit} />}</div><div className="score">SCORE <b>{player.score.toLocaleString()}</b></div></div>
}

function NextView({ player, editable, onPair }: { player: PlayerState; editable: boolean; onPair: (index: number, part: 'axis' | 'child', color: PuyoColor) => void }) {
  return <div className="next-list">{player.next.slice(0, 2).map((pair, index) => <div className={`next-pair ${editable ? 'next-editable' : ''}`} key={index}><span className="next-index">N{index + 1}</span><button disabled={!editable} className="mini-puyo" style={{ background: COLOR_MAP[pair.axis] }} onClick={() => onPair(index, 'axis', nextColor(pair.axis))}>{COLOR_NAMES[pair.axis]}</button><button disabled={!editable} className="mini-puyo" style={{ background: COLOR_MAP[pair.child] }} onClick={() => onPair(index, 'child', nextColor(pair.child))}>{COLOR_NAMES[pair.child]}</button></div>)}</div>
}

function nextColor(color: PuyoColor): PuyoColor {
  const index = EDITABLE_COLORS.indexOf(color)
  return EDITABLE_COLORS[(index + 1) % EDITABLE_COLORS.length]
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, ms) / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = (totalSeconds % 60).toFixed(1).padStart(4, '0')
  return `${minutes}:${seconds}`
}

function bindingFromEvent(event: KeyboardEvent): string {
  const modifiers: string[] = []
  if (event.ctrlKey) modifiers.push('Ctrl')
  if (event.shiftKey) modifiers.push('Shift')
  if (event.altKey) modifiers.push('Alt')
  if (event.metaKey) modifiers.push('Win')
  return [...modifiers, event.code].join('+')
}

function syncEditedBoardWithFalling(player: PlayerState, board: Board): PlayerState {
  const resolution = player.resolution
  if (!resolution?.fallingCells?.length) return { ...player, board }

  const fallingCells = resolution.fallingCells.flatMap((fallingCell) => {
    const nextColor = board[fallingCell.y]?.[fallingCell.x] ?? fallingCell.color
    return nextColor === null ? [] : [{ ...fallingCell, color: nextColor }]
  })

  return {
    ...player,
    board,
    resolution: { ...resolution, fallingCells },
  }
}

export default function App() {
  const [game, setGame] = useState<GameState>(() => createGame())
  const [replay, setReplay] = useState<ReplayState>(() => createReplay(game))
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editPlayer, setEditPlayer] = useState<0 | 1>(0)
  const [focusedPlayer, setFocusedPlayer] = useState<0 | 1>(0)
  const [snapshotTitle, setSnapshotTitle] = useState('')
  const [snapshotTags, setSnapshotTags] = useState('')
  const [message, setMessage] = useState('')
  const [liveElapsedMs, setLiveElapsedMs] = useState(0)
  const [keybinds, setKeybinds] = useState<Keybinds>(() => loadKeybinds())
  const [keybindModalOpen, setKeybindModalOpen] = useState(false)
  const [turnCopyBackup, setTurnCopyBackup] = useState<TurnCopyBackup | null>(null)
  const [roomOpen, setRoomOpen] = useState(false)
  const [roomFocusState, setRoomFocusState] = useState<RoomFocusState | null>(null)
  const [roomMemberId, setRoomMemberId] = useState('')
  const [roomConnected, setRoomConnected] = useState(false)
  const [pendingRoomFocus, setPendingRoomFocus] = useState<0 | 1 | null>(null)
  const gameRef = useRef(game); gameRef.current = game
  const replayRef = useRef(replay); replayRef.current = replay
  const elapsedMsRef = useRef(0)
  const clockAtRef = useRef(performance.now())

  useEffect(() => { saveKeybinds(keybinds) }, [keybinds])

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '')
    const params = new URLSearchParams(hash)
    if (params.get('room') && params.get('token')) setRoomOpen(true)
  }, [])

  useEffect(() => {
    const onFocusState = (event: Event) => {
      const detail = (event as CustomEvent<RoomFocusStateDetail>).detail
      if (!detail) return
      setRoomConnected(detail.connected)
      setRoomMemberId(detail.memberId || '')
      setRoomFocusState(detail.focus ? [...detail.focus] as RoomFocusState : null)
      if (!detail.connected) setPendingRoomFocus(null)
    }
    const onFocusGranted = (event: Event) => {
      const detail = (event as CustomEvent<{ playerIndex: 0 | 1 }>).detail
      if (!detail) return
      setPendingRoomFocus(null)
      const index = detail.playerIndex
      setFocusedPlayer(index)
      const nextGame = { ...gameRef.current, activePlayer: index }
      gameRef.current = nextGame
      setGame(nextGame)
    }
    const onFocusDenied = (event: Event) => {
      const detail = (event as CustomEvent<RoomFocusResultDetail>).detail
      if (!detail) return
      setPendingRoomFocus(null)
      const label = detail.playerIndex === 0 ? 'A' : 'B'
      setMessage(`Player ${label} は現在ほかの参加者が操作中です`)
    }
    window.addEventListener('puyo-room-focus-state', onFocusState)
    window.addEventListener('puyo-room-focus-granted', onFocusGranted)
    window.addEventListener('puyo-room-focus-denied', onFocusDenied)
    return () => {
      window.removeEventListener('puyo-room-focus-state', onFocusState)
      window.removeEventListener('puyo-room-focus-granted', onFocusGranted)
      window.removeEventListener('puyo-room-focus-denied', onFocusDenied)
    }
  }, [])

  const syncElapsed = useCallback((running: boolean) => {
    const now = performance.now()
    if (running) elapsedMsRef.current += Math.max(0, now - clockAtRef.current)
    clockAtRef.current = now
    return elapsedMsRef.current
  }, [])

  const resetClock = useCallback((elapsedMs = 0) => {
    elapsedMsRef.current = Math.max(0, elapsedMs)
    clockAtRef.current = performance.now()
    setLiveElapsedMs(elapsedMsRef.current)
  }, [])

  const applyRemoteRoomState = useCallback((state: SharedRoomState) => {
    const nextGame = { ...state.game, running: false }
    const nextReplay = { ...state.replay, playing: false }
    gameRef.current = nextGame
    replayRef.current = nextReplay
    setGame(nextGame)
    setReplay(nextReplay)
    resetClock(state.elapsedMs)
  }, [resetClock])

  const applyRemoteRoomLiveState = useCallback((state: SharedRoomLiveState) => {
    const nextGame = { ...state.game, running: false }
    const currentReplay = replayRef.current
    let frames = currentReplay.frames
    const lastFrame = frames[frames.length - 1]
    if (!lastFrame || state.elapsedMs > lastFrame.elapsedMs + 90) {
      frames = [...frames, captureFrame(nextGame, state.elapsedMs)]
    }
    const cursorElapsed = Math.max(0, state.cursorElapsedMs)
    const cursor = findFrameAtElapsed(frames, cursorElapsed)
    const nextReplay: ReplayState = { ...currentReplay, frames, cursor, playing: state.playing, speed: state.speed }
    gameRef.current = nextGame
    replayRef.current = nextReplay
    setGame(nextGame)
    setReplay(nextReplay)
    resetClock(state.elapsedMs)
  }, [resetClock])

  useEffect(() => {
    const onTimelineSeek = (event: Event) => {
      const detail = (event as CustomEvent<TimelineSeekDetail>).detail
      if (!detail || (detail.mode !== 'time' && detail.mode !== 'cursor')) return
      const currentReplay = replayRef.current
      if (currentReplay.frames.length < 2) return
      const cursor = detail.mode === 'time' ? findFrameAtElapsed(currentReplay.frames, detail.value) : Math.max(0, Math.min(currentReplay.frames.length - 1, Math.round(detail.value)))
      const frame = currentReplay.frames[cursor]
      if (!frame) return
      resetClock(frame.elapsedMs)
      const nextGame = frameToGame(frame, false)
      gameRef.current = nextGame
      setGame(nextGame)
      setReplay(state => ({ ...state, cursor, playing: false }))
    }
    window.addEventListener('puyo-timeline-seek', onTimelineSeek)
    return () => window.removeEventListener('puyo-timeline-seek', onTimelineSeek)
  }, [resetClock])

  useEffect(() => {
    const onReturnOriginal = () => {
      const currentReplay = replayRef.current
      const originalFrames = currentReplay.originalFrames
      if (!originalFrames?.length) return
      const currentElapsed = currentReplay.frames[currentReplay.cursor]?.elapsedMs ?? currentReplay.branchOriginElapsedMs ?? 0
      const cursor = findFrameAtElapsed(originalFrames, currentElapsed)
      const frame = originalFrames[cursor]
      if (!frame) return
      resetClock(frame.elapsedMs)
      const nextGame = frameToGame(frame, false)
      gameRef.current = nextGame
      setGame(nextGame)
      setReplay(state => ({ ...state, frames: originalFrames, cursor, playing: false, originalFrames: undefined, branchOriginElapsedMs: undefined }))
      window.dispatchEvent(new Event('puyo-timeline-branch-cleared'))
      window.dispatchEvent(new Event('puyo-timeline-seek-complete'))
    }
    window.addEventListener('puyo-timeline-return-original', onReturnOriginal)
    return () => window.removeEventListener('puyo-timeline-return-original', onReturnOriginal)
  }, [resetClock])

  const refreshSnapshots = useCallback(async () => {
    try { setSnapshots(await listSnapshots()) } catch { setMessage('局面ライブラリを読み込めませんでした') }
  }, [])

  useEffect(() => { void refreshSnapshots() }, [refreshSnapshots])

  const setLocalFocus = useCallback((index: 0 | 1) => {
    setFocusedPlayer(index)
    const nextGame = { ...gameRef.current, activePlayer: index }
    gameRef.current = nextGame
    setGame(nextGame)
  }, [])

  const focusPlayer = useCallback((index: 0 | 1) => {
    if (roomConnected && roomMemberId) {
      if (pendingRoomFocus !== null) return
      if (roomFocusState?.[index] === roomMemberId) {
        setLocalFocus(index)
        return
      }
      setPendingRoomFocus(index)
      window.dispatchEvent(new CustomEvent('puyo-room-request-focus', { detail: { playerIndex: index } }))
      return
    }
    setLocalFocus(index)
  }, [pendingRoomFocus, roomConnected, roomFocusState, roomMemberId, setLocalFocus])

  const editPlayerState = (fn: (player: PlayerState) => PlayerState) => setGame(current => {
    const players = [...current.players] as [PlayerState, PlayerState]
    players[editPlayer] = fn(players[editPlayer])
    const nextGame = { ...current, players }
    gameRef.current = nextGame
    return nextGame
  })

  const setEditedBoard = (board: Board) => editPlayerState(player => syncEditedBoardWithFalling(player, board))
  const setEditedPair = (pair: PairEdit) => editPlayerState(player => setPairColors(player, pair.axis, pair.child))

  const dispatch = useCallback((action: GameplayAction) => {
    const current = gameRef.current
    const playerIndex = focusedPlayer
    const player = current.players[playerIndex]
    const historyAction = action === 'reset-turn' || action === 'undo' || action === 'redo'
    const playerPauseAction = action === 'toggle-player-pause'
    if (editMode || replayRef.current.playing) return
    if (roomConnected && roomMemberId && pendingRoomFocus !== null) return
    if (roomConnected && roomMemberId && roomFocusState?.[playerIndex] !== roomMemberId) return
    if (!historyAction && !playerPauseAction && (player.controlMode !== 'human' || !player.alive || !current.running)) return
    if ((historyAction || playerPauseAction) && player.controlMode === 'replay') return
    const elapsedMs = syncElapsed(current.running)
    const nextPlayer = updatePlayer(player, action)
    if (nextPlayer === player) return
    const players = [...current.players] as [PlayerState, PlayerState]
    players[playerIndex] = nextPlayer
    const nextGame = { ...current, players, activePlayer: playerIndex, tick: current.tick + 1 }
    gameRef.current = nextGame
    setGame(nextGame)
    setReplay(state => appendFrame(state, nextGame, elapsedMs))
    window.dispatchEvent(new CustomEvent('puyo-room-local-action', { detail: { playerIndex, action } }))
  }, [editMode, focusedPlayer, pendingRoomFocus, roomConnected, roomFocusState, roomMemberId, syncElapsed])

  useEffect(() => {
    const onStudentAction = (event: Event) => {
      const detail = (event as CustomEvent<{ playerIndex: 0 | 1; action: GameplayAction | 'global-pause' }>).detail
      if (!detail || (detail.playerIndex !== 0 && detail.playerIndex !== 1) || !roomConnected || !roomMemberId) return
      const current = gameRef.current

      if (detail.action === 'global-pause') {
        const currentReplay = replayRef.current
        if (currentReplay.playing) {
          const frame = currentReplay.frames[currentReplay.cursor]
          const elapsedMs = frame?.elapsedMs ?? 0
          setReplay(state => ({ ...state, playing: false }))
          resetClock(elapsedMs)
          const nextGame = { ...frameToGame(frame ?? currentReplay.frames[0], false), running: true }
          gameRef.current = nextGame
          setGame(nextGame)
        } else {
          const elapsedMs = syncElapsed(current.running)
          const nextGame = { ...current, running: !current.running }
          gameRef.current = nextGame
          setGame(nextGame)
          setReplay(state => appendFrame(state, nextGame, elapsedMs))
        }
        window.dispatchEvent(new Event('puyo-room-state-changed'))
        return
      }

      const player = current.players[detail.playerIndex]
      const historyAction = detail.action === 'reset-turn' || detail.action === 'undo' || detail.action === 'redo'
      const playerPauseAction = detail.action === 'toggle-player-pause'
      if (!historyAction && !playerPauseAction && (player.controlMode !== 'human' || !player.alive || !current.running)) return
      if ((historyAction || playerPauseAction) && player.controlMode === 'replay') return
      const elapsedMs = syncElapsed(current.running)
      const nextPlayer = updatePlayer(player, detail.action)
      if (nextPlayer === player) return
      const players = [...current.players] as [PlayerState, PlayerState]
      players[detail.playerIndex] = nextPlayer
      const nextGame = { ...current, players, activePlayer: detail.playerIndex, tick: current.tick + 1 }
      gameRef.current = nextGame
      setGame(nextGame)
      setReplay(state => appendFrame(state, nextGame, elapsedMs))
      window.dispatchEvent(new Event('puyo-room-state-changed'))
    }
    window.addEventListener('puyo-room-student-action', onStudentAction)
    return () => window.removeEventListener('puyo-room-student-action', onStudentAction)
  }, [resetClock, roomConnected, roomMemberId, syncElapsed])

  const actionForKey = useCallback((event: KeyboardEvent): GameplayAction | null => {
    const binding = bindingFromEvent(event)
    const entries = Object.entries(keybinds) as [GameplayAction, [string, string]][]
    const match = entries.find(([, slots]) => slots[0] === binding || slots[1] === binding)
    return match?.[0] ?? null
  }, [keybinds])

  const replaySelected = game.players.some(player => player.controlMode === 'replay')
  const previousReplaySelected = useRef(replaySelected)

  useEffect(() => {
    if (replaySelected === previousReplaySelected.current) return
    setReplay(current => {
      if (!replaySelected) return { ...current, playing: false }
      const replayPlayers = game.players.map(player => player.controlMode) as [PlayerState['controlMode'], PlayerState['controlMode']]
      const frames = current.frames.map(frame => ({ ...frame, players: [
        { ...frame.players[0], controlMode: replayPlayers[0] === 'replay' ? 'replay' : frame.players[0].controlMode },
        { ...frame.players[1], controlMode: replayPlayers[1] === 'replay' ? 'replay' : frame.players[1].controlMode },
      ] as [PlayerState, PlayerState] }))
      if (frames.length < 2) return { ...current, frames, playing: false }
      const cursor = current.cursor >= frames.length - 1 ? 0 : current.cursor
      return { ...current, frames, cursor, playing: true }
    })
    previousReplaySelected.current = replaySelected
  }, [replaySelected, game.players])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const running = gameRef.current.running && !editMode && !replayRef.current.playing
      setLiveElapsedMs(syncElapsed(running))
    }, 100)
    return () => window.clearInterval(timer)
  }, [editMode, syncElapsed])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || keybindModalOpen) return
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
      const key = event.key.toLowerCase()
      if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && (key === '1' || key === '2')) {
        event.preventDefault()
        focusPlayer(key === '1' ? 0 : 1)
        return
      }
      if (key === 'c' && !event.ctrlKey && !event.shiftKey && !event.metaKey && !event.altKey) {
        event.preventDefault()
        setEditMode(current => !current)
        return
      }
      if (key === 'f') {
        if (!editMode) {
          event.preventDefault()
          const current = gameRef.current
          const currentReplay = replayRef.current
          if (currentReplay.playing) {
            const frame = currentReplay.frames[currentReplay.cursor]
            const elapsedMs = frame?.elapsedMs ?? 0
            setReplay(state => ({ ...state, playing: false }))
            resetClock(elapsedMs)
            const nextGame = { ...frameToGame(frame ?? currentReplay.frames[0], false), running: true }
            gameRef.current = nextGame
            setGame(nextGame)
            return
          }
          const elapsedMs = syncElapsed(current.running)
          const nextGame = { ...current, running: !current.running }
          gameRef.current = nextGame
          setGame(nextGame)
          setReplay(state => appendFrame(state, nextGame, elapsedMs))
          setLiveElapsedMs(elapsedMs)
          window.dispatchEvent(new CustomEvent('puyo-room-local-action', { detail: { playerIndex: focusedPlayer, action: 'global-pause' } }))
        }
        return
      }
      if (editMode) return
      const action = actionForKey(event)
      if (action) {
        event.preventDefault()
        dispatch(action)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [actionForKey, dispatch, editMode, focusPlayer, keybindModalOpen, resetClock, syncElapsed])

  useEffect(() => {
    const timer = window.setInterval(() => setGame(current => {
      if (!current.running || editMode || replaySelected || replayRef.current.playing) return current
      const elapsedMs = syncElapsed(current.running)
      const players = [...current.players] as [PlayerState, PlayerState]
      let changed = false
      players.forEach((player, index) => {
        if (player.controlMode !== 'human' || !player.alive || player.resolution) return
        const nextPlayer = advancePlayer(player, 50)
        if (nextPlayer !== player) { players[index] = nextPlayer; changed = true }
      })
      if (!changed) return current
      const nextGame = { ...current, players, tick: current.tick + 1 }
      gameRef.current = nextGame
      setReplay(state => appendFrame(state, nextGame, elapsedMs))
      return nextGame
    }), 50)
    return () => window.clearInterval(timer)
  }, [editMode, replaySelected, syncElapsed])

  useEffect(() => {
    const timer = window.setInterval(() => setGame(current => {
      if (!current.running || editMode || replaySelected || replayRef.current.playing || !current.players.some(player => player.resolution)) return current
      const elapsedMs = syncElapsed(current.running)
      const players = [...current.players] as [PlayerState, PlayerState]
      const attacks: Array<{ attacker: 0 | 1; amount: number }> = []
      players.forEach((player, index) => {
        if (!player.resolution) return
        const result = advanceResolution(player)
        players[index] = result.player
        if (result.attack > 0) attacks.push({ attacker: index as 0 | 1, amount: result.attack })
      })

      for (const { attacker, amount } of attacks) {
        const targetIndex = attacker === 0 ? 1 : 0
        const target = players[targetIndex]
        const incomingGarbage = (target.incomingGarbage ?? target.garbage ?? 0) + amount
        players[targetIndex] = { ...target, incomingGarbage, garbage: incomingGarbage }
      }

      const nextGame = { ...current, players, tick: current.tick + 1 }
      gameRef.current = nextGame
      setReplay(state => appendFrame(state, nextGame, elapsedMs))
      return nextGame
    }), 420)
    return () => window.clearInterval(timer)
  }, [editMode, replaySelected, syncElapsed])

  useEffect(() => {
    if (!replay.playing || replay.frames.length < 2) return
    const startedAt = performance.now()
    const baseElapsed = replay.frames[replay.cursor]?.elapsedMs ?? 0
    const timer = window.setInterval(() => {
      const currentReplay = replayRef.current
      if (!currentReplay.playing || currentReplay.frames.length < 2) return
      const targetElapsed = baseElapsed + (performance.now() - startedAt) * currentReplay.speed
      const cursor = findFrameAtElapsed(currentReplay.frames, targetElapsed)
      const frame = currentReplay.frames[cursor]
      resetClock(frame.elapsedMs)
      const nextGame = { ...frameToGame(frame, false) }
      gameRef.current = nextGame
      setGame(nextGame)
      setReplay(state => ({ ...state, cursor, playing: cursor < state.frames.length - 1 }))
    }, 40)
    return () => window.clearInterval(timer)
  }, [replay.playing, replay.speed, resetClock])

  const togglePlayback = () => {
    const currentReplay = replayRef.current
    if (currentReplay.frames.length < 2) return
    if (currentReplay.playing) { setReplay(state => ({ ...state, playing: false })); return }
    const frame = currentReplay.frames[currentReplay.cursor]
    if (!frame) return
    syncElapsed(gameRef.current.running)
    resetClock(frame.elapsedMs)
    if (currentReplay.cursor >= currentReplay.frames.length - 1) {
      const first = currentReplay.frames[0]
      resetClock(first.elapsedMs)
      const nextGame = frameToGame(first, false)
      gameRef.current = nextGame
      setGame(nextGame)
      setReplay(state => ({ ...state, cursor: 0, playing: true }))
      return
    }
    const stoppedGame = { ...gameRef.current, running: false }
    gameRef.current = stoppedGame
    setGame(stoppedGame)
    setReplay(state => ({ ...state, playing: true }))
  }

  const setMode = (index: 0 | 1, mode: PlayerState['controlMode']) => {
    const current = gameRef.current
    const elapsedMs = syncElapsed(current.running)
    const players = [...current.players] as [PlayerState, PlayerState]
    players[index] = { ...players[index], controlMode: mode }
    const nextReplaySelected = players.some(player => player.controlMode === 'replay')
    const nextGame = { ...current, players, running: nextReplaySelected ? false : true }
    gameRef.current = nextGame
    setGame(nextGame)
    setReplay(state => appendFrame(state, nextGame, elapsedMs))
  }

  const reset = () => { const next = createGame(); gameRef.current = next; setGame(next); setReplay(createReplay(next)); setMessage(''); setEditMode(false); setTurnCopyBackup(null); focusPlayer(0); resetClock(0) }

  const copyPlayerScreen = (sourceIndex: 0 | 1, targetIndex: 0 | 1) => {
    const current = gameRef.current
    const source = current.players[sourceIndex]
    const target = current.players[targetIndex]
    if (!source.alive || source.resolution || !target.alive || target.resolution || editMode || replayRef.current.playing) {
      setMessage('現在の状態ではコピーできません')
      return
    }
    const elapsedMs = syncElapsed(current.running)
    setTurnCopyBackup({ game: cloneGameState(current), replay: cloneReplayState(replayRef.current), elapsedMs })
    const players = [...current.players] as [PlayerState, PlayerState]
    players[targetIndex] = { ...clonePlayer(source), controlMode: 'human', fallElapsedMs: 0, lockElapsedMs: 0, quickTurnArmed: false }
    const nextGame = { ...current, players, activePlayer: targetIndex }
    gameRef.current = nextGame
    setFocusedPlayer(targetIndex)
    setGame(nextGame)
    setReplay(state => appendFrame(state, nextGame, elapsedMs))
    setMessage(`Player ${sourceIndex === 0 ? 'A' : 'B'} の状態を Player ${targetIndex === 0 ? 'A' : 'B'} にコピーしました`)
  }

  const canCopyDirection = (sourceIndex: 0 | 1, targetIndex: 0 | 1) => {
    const source = game.players[sourceIndex]
    const target = game.players[targetIndex]
    return !editMode && !replay.playing && source.alive && !source.resolution && target.alive && !target.resolution
  }

  const restoreTurnCopy = () => {
    if (!turnCopyBackup) return
    const restoredGame = cloneGameState(turnCopyBackup.game)
    gameRef.current = restoredGame
    setGame(restoredGame)
    const restoredReplay = cloneReplayState(turnCopyBackup.replay)
    replayRef.current = restoredReplay
    setReplay(restoredReplay)
    setFocusedPlayer(turnCopyBackup.game.activePlayer)
    resetClock(turnCopyBackup.elapsedMs)
    setTurnCopyBackup(null)
    setMessage('コピー前の状態に戻しました')
  }

  const changeNext = (index:number, part:'axis'|'child') => editPlayerState(player => { const pair = player.next[index]; return setNextPair(player,index,{ ...pair,[part]:nextColor(pair[part]) }) })
  const changeCurrentColor = (part:'axis'|'child') => editPlayerState(player => { const pair = player.current.pair; return setPairColors(player, part === 'axis' ? nextColor(pair.axis) : pair.axis, part === 'child' ? nextColor(pair.child) : pair.child) })
  const rotateCurrent = (delta:1|-1) => editPlayerState(player => setPairRotation(player,((player.current.rotation+delta+4)%4) as 0|1|2|3))
  const changeGarbage = (delta:number) => editPlayerState(player => setGarbage(player,(player.incomingGarbage ?? player.garbage ?? 0)+delta))
  const setGarbageValue = (value:string) => editPlayerState(player => setGarbage(player,Number(value)||0))
  const editableControls: EditControls = { changeCurrentColor, rotateCurrent, changeNext, changeGarbage, setGarbageValue }

  const saveCurrentSnapshot = async () => { try { await saveSnapshot(makeSnapshot(game,snapshotTitle,snapshotTags.split(',').map(tag=>tag.trim()))); setSnapshotTitle(''); setSnapshotTags(''); setMessage('局面を保存しました'); await refreshSnapshots(); setLibraryOpen(true) } catch { setMessage('局面の保存に失敗しました') } }
  const loadSnapshot = (snapshot:Snapshot) => {
    const restored = { ...cloneGameState(snapshot.state), running: false }
    gameRef.current = restored
    setGame(restored)
    const restoredReplay = { ...createReplay(restored), playing: false }
    replayRef.current = restoredReplay
    setReplay(restoredReplay)
    setLibraryOpen(false)
    setEditMode(false)
    setTurnCopyBackup(null)
    setMessage(`「${snapshot.title}」を読み込みました`)
    resetClock(0)
    setFocusedPlayer(restored.activePlayer)
    window.dispatchEvent(new Event('puyo-snapshot-loaded'))
  }
  const removeSnapshot = async (id:string) => { try { await deleteSnapshot(id); await refreshSnapshots(); setMessage('局面を削除しました') } catch { setMessage('局面の削除に失敗しました') } }

  const activeFrame = replay.frames[replay.cursor]
  const lastFrame = replay.frames[replay.frames.length - 1]
  const lastCursor = Math.max(0, replay.frames.length - 1)
  const currentTimelineMs = game.running && replay.cursor === lastCursor ? Math.max(activeFrame?.elapsedMs ?? 0, liveElapsedMs) : (activeFrame?.elapsedMs ?? 0)
  const timelineMaxMs = Math.max(lastFrame?.elapsedMs ?? 0, game.running && replay.cursor === lastCursor ? currentTimelineMs : 0)
  const timelineEvents = buildTimelineEvents(replay.frames)
  const playerALocked = roomConnected && Boolean(roomFocusState?.[0] && roomFocusState[0] !== roomMemberId)
  const playerBLocked = roomConnected && Boolean(roomFocusState?.[1] && roomFocusState[1] !== roomMemberId)

  return <main className="app"><header className="topbar"><div className="title-area"><div><div className="eyebrow">PUZZLE COACHING LAB</div><h1>Puyo Trainer</h1></div><button className="title-reset-button" onClick={reset}>リセット</button></div><div className="header-actions"><span className="phase">Phase 4 · Editor</span><div className="editor-tabs inline-tabs">{(['A','B'] as const).map((label,index)=><button className={editPlayer===index?'selected':''} key={label} onClick={()=>setEditPlayer(index as 0|1)}>{editMode ? `編集 ${label}` : `Player ${label}`}</button>)}</div><button onClick={() => setLibraryOpen(v=>!v)}>局面ライブラリ {snapshots.length}</button><button className="settings-button" title="キーバインド設定" aria-label="キーバインド設定" onClick={() => setKeybindModalOpen(true)}>⚙️</button></div></header>
  <section className="snapshot-panel"><div><div className="aside-label">SNAPSHOT</div><strong>現在の局面を保存</strong><span>編集した盤面・組ぷよ・NEXT・おじゃまも保存されます</span></div><div className="snapshot-form"><input value={snapshotTitle} onChange={e=>setSnapshotTitle(e.target.value)} placeholder="局面名（例：2ダブ受け）"/><input value={snapshotTags} onChange={e=>setSnapshotTags(e.target.value)} placeholder="タグ（カンマ区切り）"/><button onClick={()=>void saveCurrentSnapshot()}>保存</button></div></section>
  {libraryOpen && <section className="library-panel"><div className="library-header"><div><div className="aside-label">SNAPSHOT LIBRARY</div><strong>保存局面 {snapshots.length} 件</strong></div><button onClick={()=>setLibraryOpen(false)}>閉じる</button></div>{snapshots.length===0?<div className="empty-library">まだ保存された局面はありません。</div>:<div className="snapshot-list">{snapshots.map(snapshot=><div className="snapshot-item" key={snapshot.id}><div className="snapshot-info"><strong>{snapshot.title}</strong><span>Tick {snapshot.sourceTick} · {new Date(snapshot.createdAt).toLocaleString('ja-JP')}</span>{snapshot.tags.length>0&&<div className="tags">{snapshot.tags.map(tag=><em key={tag}>{tag}</em>)}</div>}</div><div className="snapshot-actions"><button onClick={()=>loadSnapshot(snapshot)}>読み込む</button><button onClick={()=>void removeSnapshot(snapshot.id)}>削除</button></div></div>)}</div>}</section>}
  {message && <div className="status-message">{message}</div>}
  <section className="arena"><PlayerPanel title="A" player={game.players[0]} focused={focusedPlayer===0} locked={playerALocked} onFocus={()=>focusPlayer(0)} onMode={mode=>setMode(0,mode)} editMode={editMode&&editPlayer===0} onBoardChange={setEditedBoard} onPairEdit={setEditedPair} editableControls={editableControls}/><div className="vs"><span>VS</span><small>LOCAL</small><button className="board-edit-button" onClick={()=>setRoomOpen(true)}>ROOM</button><button className="board-edit-button" disabled={!canCopyDirection(0,1)} onClick={()=>copyPlayerScreen(0,1)}>A→Bをコピー</button><button className="board-edit-button" disabled={!canCopyDirection(1,0)} onClick={()=>copyPlayerScreen(1,0)}>B→Aをコピー</button><button className="board-edit-button" disabled={!turnCopyBackup} onClick={restoreTurnCopy} style={!turnCopyBackup ? { opacity: 0.45, cursor: 'default' } : undefined}>コピー前に戻す</button><button className="board-edit-button" onClick={() => setEditMode(v=>!v)}>{editMode ? '編集終了' : '盤面を直接編集'}</button></div><PlayerPanel title="B" player={game.players[1]} focused={focusedPlayer===1} locked={playerBLocked} onFocus={()=>focusPlayer(1)} onMode={mode=>setMode(1,mode)} editMode={editMode&&editPlayer===1} onBoardChange={setEditedBoard} onPairEdit={setEditedPair} editableControls={editableControls}/></section>
  <section className="replay-panel"><div className="replay-header"><div><div className="aside-label">TIMELINE</div><strong>{formatTime(currentTimelineMs)} / {formatTime(timelineMaxMs)}</strong></div><span>Frame {replay.cursor+1} / {replay.frames.length}</span></div><div className="timeline-wrap"><div className="timeline-labels"><span>0:00.0</span><span>{formatTime(currentTimelineMs)}</span><span>{game.running && replay.cursor === lastCursor ? 'LIVE' : formatTime(lastFrame?.elapsedMs ?? 0)}</span></div><TimelineEvents events={timelineEvents} maxTimeMs={timelineMaxMs} onSeek={seekTime}/><input className="timeline" type="range" min="0" max={Math.max(1,timelineMaxMs)} step="10" value={Math.min(currentTimelineMs,Math.max(1,timelineMaxMs))} onChange={e=>seekTime(Number(e.target.value))} disabled={replay.frames.length < 2} aria-label="Game timeline"/></div><div className="replay-controls"><button onClick={()=>seek(0)} disabled={replay.frames.length < 2}>⏮</button><button onClick={()=>seek(replay.cursor-1)} disabled={replay.cursor <= 0}>◀</button><button className="play" onClick={togglePlayback} disabled={replay.frames.length < 2}>{replay.playing?'⏸':'▶'}</button><button onClick={()=>seek(replay.cursor+1)} disabled={replay.cursor >= lastCursor}>▶</button><button onClick={()=>seek(lastCursor)} disabled={replay.frames.length < 2}>⏭</button><div className="speed-buttons">{REPLAY_SPEEDS.map(speed=><button className={replay.speed===speed?'selected':''} key={speed} onClick={()=>setReplay(state=>({...state,speed}))}>{speed}x</button>)}</div></div><div className="replay-hint">タイムラインは常時利用可能 · 盤面をクリックしてフォーカス · Ctrl+1 / Ctrl+2でPlayer切替 · 戻した地点からFキーで再開 · Replay選択時は自動再生</div></section>
  <section className="controls"><div><strong>フォーカス中のPlayer</strong>　左 / 右 / 回転 / 落下 / ハードドロップを共通キーバインドで操作</div><div><strong>Ctrl+1</strong> Player A　<strong>Ctrl+2</strong> Player B　・　盤面クリックでも切替</div><div><strong>F</strong> ゲーム再開 / 停止　<strong>X</strong> フォーカス中のPlayerだけ固定 / 再開　<strong>C</strong> 編集モード切替　<strong>⚙️</strong> キーバインド設定</div><div><strong>A→Bをコピー</strong>　Player Aの局面をPlayer Bへコピー · <strong>B→Aをコピー</strong>　Player Bの局面をPlayer Aへコピー · <strong>コピー前に戻す</strong> で操作前へ復元</div></section>
  <footer>独自ゲームエンジン · 公式素材・データ不使用 · Phase 4 Position Editor</footer>{keybindModalOpen && <KeybindModal keybinds={keybinds} onChange={setKeybinds} onClose={()=>setKeybindModalOpen(false)} />}<RoomPanel open={roomOpen} onClose={()=>setRoomOpen(false)} game={game} replay={replay} currentTimelineMs={currentTimelineMs} onRemoteState={applyRemoteRoomState} onRemoteLiveState={applyRemoteRoomLiveState}/></main>
}

function PlayerPanel({ title, player, focused, locked, onFocus, onMode, editMode, onBoardChange, onPairEdit, editableControls }: { title:string; player:PlayerState; focused:boolean; locked:boolean; onFocus:()=>void; onMode:(mode:PlayerState['controlMode'])=>void; editMode:boolean; onBoardChange:(board:Board)=>void; onPairEdit:(pair:PairEdit)=>void; editableControls:EditControls }) { return <article className="player-card" onMouseDown={onFocus} style={focused ? { borderColor:'#6b829c', boxShadow:'0 18px 50px rgba(0,0,0,.18), 0 0 0 1px rgba(143,215,255,.28)' } : undefined}><div className="player-header"><div><span className="player-label">PLAYER</span><h2>{title}</h2></div><div style={{display:'flex',alignItems:'center',gap:'6px'}}><span className="mode" style={focused ? { border:'1px solid #5f86a7', color:'#8fd7ff' } : undefined}>{player.alive?player.controlMode:'game-over'}</span>{focused&&<span className="aside-label" style={{color:'#8fd7ff'}}>FOCUS</span>}{locked&&<span className="aside-label" style={{color:'#8f9aaa'}}>LOCK</span>}</div></div><div className="game-row"><BoardView player={player} editMode={editMode} focused={focused} onFocus={onFocus} onBoardChange={onBoardChange} onPairEdit={onPairEdit}/><aside><div className="aside-label">NEXT</div><NextView player={player} editable={editMode} onPair={editableControls.changeNext}/><div className="aside-label garbage-label">GARBAGE</div><div className="garbage">{player.incomingGarbage}</div><div className="combo-display"><div className="aside-label combo-label">COMBO</div><strong>{player.chain}</strong></div></aside></div>{editMode&&<div className="direct-edit-bar"><div className="current-pair"><button style={{background:COLOR_MAP[player.current.pair.axis]}} onMouseDown={e=>e.stopPropagation()} onClick={()=>editableControls.changeCurrentColor('axis')}>{COLOR_NAMES[player.current.pair.axis]}</button><button style={{background:COLOR_MAP[player.current.pair.child]}} onMouseDown={e=>e.stopPropagation()} onClick={()=>editableControls.changeCurrentColor('child')}>{COLOR_NAMES[player.current.pair.child]}</button><button onMouseDown={e=>e.stopPropagation()} onClick={()=>editableControls.rotateCurrent(-1)}>↶</button><button onMouseDown={e=>e.stopPropagation()} onClick={()=>editableControls.rotateCurrent(1)}>↷</button></div><div className="garbage-editor"><button onClick={()=>editableControls.changeGarbage(-1)}>−</button><input type="number" min="0" value={player.incomingGarbage} onMouseDown={e=>e.stopPropagation()} onChange={e=>editableControls.setGarbageValue(e.target.value)}/><button onMouseDown={e=>e.stopPropagation()} onClick={()=>editableControls.changeGarbage(1)}>＋</button></div></div>}<div className="mode-buttons">{(['human','fixed','replay','none'] as const).map(mode=><button className={player.controlMode===mode?'selected':''} key={mode} onMouseDown={e=>e.stopPropagation()} onClick={()=>onMode(mode)}>{mode}</button>)}</div></article> }
