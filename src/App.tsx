import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { advancePlayer, advanceResolution, cellsOf, createGame, updatePlayer } from './game/engine'
import { EDITABLE_COLORS, setGarbage, setNextPair, setPairColors, setPairRotation } from './game/editor'
import { appendFrame, clonePlayer, createReplay, findFrameAtElapsed, frameToGame, REPLAY_SPEEDS, type ReplayState } from './game/replay'
import { cloneGameState, deleteSnapshot, listSnapshots, makeSnapshot, saveSnapshot, type Snapshot } from './game/snapshots'
import { loadKeybinds, saveKeybinds, type GameplayAction, type Keybinds } from './game/keybinds'
import { ROWS, COLS, type Board, type GameState, type PlayerState, type PuyoColor } from './game/types'
import { DirectBoardEditor } from './components/DirectBoardEditor'
import { KeybindModal } from './components/KeybindModal'
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

const COLOR_MAP: Record<PuyoColor, string> = { 1: '#ff5b68', 2: '#5aa7ff', 3: '#58d68d', 4: '#b66cff' }
const COLOR_NAMES: Record<PuyoColor, string> = { 1: '赤', 2: '青', 3: '緑', 4: '紫' }

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

  return <div className="board-stage"><div className="board-wrap"><div className="board" aria-label="ゲーム盤面" onMouseDown={onFocus} style={focused ? { boxShadow: '0 0 0 2px rgba(143,215,255,.65), 0 0 24px rgba(143,215,255,.12)' } : undefined}>{Array.from({ length: ROWS * COLS }, (_, index) => {
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
      {color && <span className={`puyo ${fallingCell ? 'falling-puyo' : ''}`} style={puyoStyle} />}
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
  const gameRef = useRef(game); gameRef.current = game
  const replayRef = useRef(replay); replayRef.current = replay
  const elapsedMsRef = useRef(0)
  const clockAtRef = useRef(performance.now())

  useEffect(() => { saveKeybinds(keybinds) }, [keybinds])

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

  const focusPlayer = useCallback((index: 0 | 1) => {
    setFocusedPlayer(index)
    const nextGame = { ...gameRef.current, activePlayer: index }
    gameRef.current = nextGame
    setGame(nextGame)
  }, [])

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
    if (editMode || replayRef.current.playing) return
    if (!historyAction && (player.controlMode !== 'human' || !player.alive || !current.running)) return
    if (historyAction && player.controlMode === 'replay') return
    const elapsedMs = syncElapsed(current.running)
    const nextPlayer = updatePlayer(player, action)
    if (nextPlayer === player) return
    const players = [...current.players] as [PlayerState, PlayerState]
    players[playerIndex] = nextPlayer
    const nextGame = { ...current, players, activePlayer: playerIndex, tick: current.tick + 1 }
    gameRef.current = nextGame
    setGame(nextGame)
    setReplay(state => appendFrame(state, nextGame, elapsedMs))
  }, [editMode, focusedPlayer, syncElapsed])

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
      players.forEach((player, index) => { if (player.resolution) players[index] = advanceResolution(player) })
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

  const copyOpponentScreen = () => {
    const current = gameRef.current
    const source = current.activePlayer
    const target = source === 0 ? 1 : 0
    const elapsedMs = syncElapsed(current.running)
    const backup: TurnCopyBackup = { game: cloneGameState(current), replay: cloneReplayState(replayRef.current), elapsedMs }
    setTurnCopyBackup(backup)
    const sourcePlayer = current.players[source]
    const copied = clonePlayer(sourcePlayer)
    const players = [...current.players] as [PlayerState, PlayerState]
    players[target] = { ...copied, controlMode: 'replay' }
    const nextGame = { ...current, players, activePlayer: target, running: false }
    gameRef.current = nextGame
    setGame(nextGame)
    setReplay(state => appendFrame(state, nextGame, elapsedMs))
  }

  const restoreOpponentScreen = () => {
    if (!turnCopyBackup) return
    const backup = turnCopyBackup
    gameRef.current = backup.game
    setGame(backup.game)
    setReplay(backup.replay)
    resetClock(backup.elapsedMs)
    setTurnCopyBackup(null)
  }

  const editControls: EditControls = {
    changeCurrentColor: (part) => editPlayerState(player => {
      const current = player.current.pair[part]
      return setPairColors(player, part === 'axis' ? nextColor(current) : player.current.pair.axis, part === 'child' ? nextColor(current) : player.current.pair.child)
    }),
    rotateCurrent: (delta) => editPlayerState(player => setPairRotation(player, ((player.current.rotation + delta + 4) % 4) as PlayerState['current']['rotation'])),
    changeNext: (index, part) => editPlayerState(player => setNextPair(player, index, { ...player.next[index], [part]: nextColor(player.next[index][part]) })),
    changeGarbage: (delta) => editPlayerState(player => setGarbage(player, player.garbage + delta)),
    setGarbageValue: (value) => editPlayerState(player => setGarbage(player, Number(value) || 0)),
  }

  const saveCurrentSnapshot = async () => {
    try {
      const snapshot = makeSnapshot(gameRef.current, snapshotTitle.trim() || '無題の局面', snapshotTags.split(',').map(tag => tag.trim()).filter(Boolean))
      await saveSnapshot(snapshot)
      setSnapshotTitle('')
      setSnapshotTags('')
      await refreshSnapshots()
      setMessage('局面を保存しました')
    } catch { setMessage('局面を保存できませんでした') }
  }

  const loadSnapshot = (snapshot: Snapshot) => {
    const next = cloneGameState(snapshot.game)
    gameRef.current = next
    setGame(next)
    setReplay(createReplay(next))
    setEditMode(false)
    resetClock(0)
    setMessage(`「${snapshot.title}」を読み込みました`)
  }

  const removeSnapshot = async (id: string) => {
    try { await deleteSnapshot(id); await refreshSnapshots(); setMessage('局面を削除しました') } catch { setMessage('局面を削除できませんでした') }
  }

  return <div className="app-shell">
    <header className="app-header"><div><h1>Puyo Trainer</h1><p>対戦を教材化するリプレイ・コーチングツール</p></div><div className="header-actions"><button onClick={() => setLibraryOpen(value => !value)}>局面ライブラリ</button><button onClick={() => setKeybindModalOpen(true)}>キー設定</button><button onClick={reset}>リセット</button></div></header>
    <main className="workspace">
      <section className="players">
        {[0, 1].map(index => { const player = game.players[index]; const focused = focusedPlayer === index; const editing = editMode && editPlayer === index; return <article className={`player-card ${focused ? 'focused' : ''}`} key={index}><div className="player-toolbar"><strong>Player {index === 0 ? 'A' : 'B'}</strong><span>{player.controlMode === 'replay' ? 'REPLAY' : 'HUMAN'}</span><button onClick={() => focusPlayer(index as 0 | 1)}>フォーカス</button><button onClick={() => setMode(index as 0 | 1, player.controlMode === 'replay' ? 'human' : 'replay')}>{player.controlMode === 'replay' ? '操作へ戻す' : 'REPLAY'}</button>{editing && <span className="edit-badge">EDIT</span>}</div><BoardView player={player} editMode={editing} focused={focused} onFocus={() => focusPlayer(index as 0 | 1)} onBoardChange={setEditedBoard} onPairEdit={setEditedPair}/><NextView player={player} editable={editing} onPair={(i, part, color) => editPlayerState(current => setNextPair(current, i, { ...current.next[i], [part]: color }))}/><div className="player-stats"><span>GARBAGE {player.garbage}</span><span>COMBO {player.chain}</span><span>ALIVE {player.alive ? 'YES' : 'NO'}</span></div></article> })}
      </section>
      <section className="controls">
        <div className="control-row"><button onClick={() => dispatch('undo')}>Undo</button><button onClick={() => dispatch('redo')}>Redo</button><button onClick={() => dispatch('reset-turn')}>Turn Start</button><button onClick={() => setEditMode(value => !value)}>{editMode ? '編集終了' : '編集モード'}</button></div>
        {editMode && <div className="edit-toolbar"><label>編集対象 <select value={editPlayer} onChange={event => setEditPlayer(Number(event.target.value) as 0 | 1)}><option value={0}>Player A</option><option value={1}>Player B</option></select></label><div className="edit-current"><span>現在の組ぷよ</span><button onClick={() => editControls.changeCurrentColor('axis')} style={{ background: COLOR_MAP[game.players[editPlayer].current.pair.axis] }}>軸 {COLOR_NAMES[game.players[editPlayer].current.pair.axis]}</button><button onClick={() => editControls.changeCurrentColor('child')} style={{ background: COLOR_MAP[game.players[editPlayer].current.pair.child] }}>子 {COLOR_NAMES[game.players[editPlayer].current.pair.child]}</button><button onClick={() => editControls.rotateCurrent(1)}>↻</button><button onClick={() => editControls.rotateCurrent(-1)}>↺</button></div><div className="edit-garbage"><span>おじゃま</span><button onClick={() => editControls.changeGarbage(-1)}>-</button><input value={game.players[editPlayer].garbage} onChange={event => editControls.setGarbageValue(event.target.value)} inputMode="numeric"/><button onClick={() => editControls.changeGarbage(1)}>+</button></div></div>}
        <div className="timeline-panel"><div className="timeline-header"><span>REPLAY TIMELINE</span><span>{formatTime(liveElapsedMs)}</span></div><div className="timeline-wrap"><input className="timeline" type="range" min={0} max={Math.max(0, replay.frames[replay.frames.length - 1]?.elapsedMs ?? 0)} value={replay.frames[replay.cursor]?.elapsedMs ?? 0} onChange={event => seekTime(Number(event.target.value))}/></div><div className="timeline-actions"><button onClick={() => seek(Math.max(0, replay.cursor - 1))}>◀</button><button onClick={togglePlayback}>{replay.playing ? 'Pause' : 'Play'}</button><button onClick={() => seek(Math.min(replay.frames.length - 1, replay.cursor + 1))}>▶</button><select value={replay.speed} onChange={event => setReplay(state => ({ ...state, speed: Number(event.target.value) }))}>{REPLAY_SPEEDS.map(speed => <option key={speed} value={speed}>{speed}x</option>)}</select></div></div>
        {editMode && <div className="edit-help">盤面: 左クリック選択 / Shift: 範囲 / Ctrl: 複数 / 右クリック: 色・組み合わせ / Delete: 消去</div>}
        <div className="snapshot-panel"><input value={snapshotTitle} onChange={event => setSnapshotTitle(event.target.value)} placeholder="局面タイトル"/><input value={snapshotTags} onChange={event => setSnapshotTags(event.target.value)} placeholder="タグ（カンマ区切り）"/><button onClick={saveCurrentSnapshot}>局面を保存</button></div>
        <div className="vs-actions"><button onClick={copyOpponentScreen}>相手の画面を再現</button>{turnCopyBackup && <button onClick={restoreOpponentScreen}>再現前に戻す</button>}</div>
        {libraryOpen && <div className="snapshot-library"><h2>局面ライブラリ</h2>{snapshots.length === 0 ? <p>保存された局面はありません。</p> : snapshots.map(snapshot => <div className="snapshot-item" key={snapshot.id}><div><strong>{snapshot.title}</strong><div>{snapshot.tags.join(' · ')}</div></div><div><button onClick={() => loadSnapshot(snapshot)}>読み込み</button><button onClick={() => removeSnapshot(snapshot.id)}>削除</button></div></div>)}</div>}
        {message && <div className="message">{message}</div>}
      </section>
    </main>
    {keybindModalOpen && <KeybindModal keybinds={keybinds} onChange={setKeybinds} onClose={() => setKeybindModalOpen(false)}/>} 
  </div>
}
