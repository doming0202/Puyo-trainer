import { useCallback, useEffect, useRef, useState } from 'react'
import { advancePlayer, advanceResolution, cellsOf, createGame, updatePlayer } from './game/engine'
import { EDITABLE_COLORS, setGarbage, setNextPair, setPairColors, setPairRotation } from './game/editor'
import { appendFrame, createReplay, findFrameAtElapsed, frameToGame, REPLAY_SPEEDS, type ReplayState } from './game/replay'
import { cloneGameState, deleteSnapshot, listSnapshots, makeSnapshot, saveSnapshot, type Snapshot } from './game/snapshots'
import { ROWS, COLS, type Board, type GameState, type PlayerState, type PuyoColor } from './game/types'
import { DirectBoardEditor } from './components/DirectBoardEditor'
import './styles.css'

const COLOR_MAP: Record<PuyoColor, string> = { 1: '#ff5b68', 2: '#5aa7ff', 3: '#58d68d', 4: '#b66cff' }
const COLOR_NAMES: Record<PuyoColor, string> = { 1: '赤', 2: '青', 3: '緑', 4: '紫' }
type PairEdit = { axis: PuyoColor; child: PuyoColor }

type EditControls = {
  changeCurrentColor: (part: 'axis' | 'child') => void
  rotateCurrent: (delta: 1 | -1) => void
  changeNext: (index: number, part: 'axis' | 'child') => void
  changeGarbage: (delta: number) => void
  setGarbageValue: (value: string) => void
}

function BoardView({ player, editMode, onBoardChange, onPairEdit }: { player: PlayerState; editMode: boolean; onBoardChange: (board: Board) => void; onPairEdit: (pair: PairEdit) => void }) {
  const active = player.resolution ? new Map<string, PuyoColor>() : new Map(cellsOf(player.current).map((cell) => [`${cell.x},${cell.y}`, cell.color]))
  const clearing = new Set((player.resolution?.pendingGroups ?? []).flatMap((group) => group.map(({ x, y }) => `${x},${y}`)))
  return <div className="board-stage"><div className="board-wrap"><div className="board" aria-label="ゲーム盤面">{Array.from({ length: ROWS * COLS }, (_, index) => { const x = index % COLS; const y = Math.floor(index / COLS); const key = `${x},${y}`; const color = active.get(key) ?? player.board[y][x]; return <div className={`cell ${clearing.has(key) ? 'clearing-cell' : ''}`} key={key}>{color && <span className="puyo" style={{ background: COLOR_MAP[color] }} />}</div> })}</div>{editMode && <DirectBoardEditor board={player.board} onBoardChange={onBoardChange} onPairEdit={onPairEdit} />}</div><div className="score">SCORE <b>{player.score.toLocaleString()}</b></div></div>
}

function NextView({ player, editable, onPair }: { player: PlayerState; editable: boolean; onPair: (index: number, part: 'axis' | 'child', color: PuyoColor) => void }) {
  return <div className="next-list">{player.next.slice(0, 4).map((pair, index) => <div className={`next-pair ${editable ? 'next-editable' : ''}`} key={index}><span className="next-index">N{index + 1}</span><button disabled={!editable} className="mini-puyo" style={{ background: COLOR_MAP[pair.axis] }} onClick={() => onPair(index, 'axis', nextColor(pair.axis))}>{COLOR_NAMES[pair.axis]}</button><button disabled={!editable} className="mini-puyo" style={{ background: COLOR_MAP[pair.child] }} onClick={() => onPair(index, 'child', nextColor(pair.child))}>{COLOR_NAMES[pair.child]}</button></div>)}</div>
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

export default function App() {
  const [game, setGame] = useState<GameState>(() => createGame())
  const [replay, setReplay] = useState<ReplayState>(() => createReplay(game))
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editPlayer, setEditPlayer] = useState<0 | 1>(0)
  const [nextVisible] = useState(4)
  const [snapshotTitle, setSnapshotTitle] = useState('')
  const [snapshotTags, setSnapshotTags] = useState('')
  const [message, setMessage] = useState('')
  const [liveElapsedMs, setLiveElapsedMs] = useState(0)
  const gameRef = useRef(game); gameRef.current = game
  const replayRef = useRef(replay); replayRef.current = replay
  const elapsedMsRef = useRef(0)
  const clockAtRef = useRef(performance.now())

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

  const refreshSnapshots = useCallback(async () => {
    try { setSnapshots(await listSnapshots()) } catch { setMessage('局面ライブラリを読み込めませんでした') }
  }, [])

  useEffect(() => { void refreshSnapshots() }, [refreshSnapshots])

  const editPlayerState = (fn: (player: PlayerState) => PlayerState) => setGame(current => {
    const players = [...current.players] as [PlayerState, PlayerState]
    players[editPlayer] = fn(players[editPlayer])
    return { ...current, players }
  })

  const setEditedBoard = (board: Board) => editPlayerState(player => ({ ...player, board }))
  const setEditedPair = (pair: PairEdit) => editPlayerState(player => setPairColors(player, pair.axis, pair.child))

  const dispatch = useCallback((playerIndex: 0 | 1, action: Parameters<typeof updatePlayer>[1]) => {
    setGame(current => {
      const player = current.players[playerIndex]
      if (editMode || !player.alive || player.controlMode !== 'human' || !current.running || replayRef.current.playing) return current
      const elapsedMs = syncElapsed(current.running)
      const players = [...current.players] as [PlayerState, PlayerState]
      players[playerIndex] = updatePlayer(player, action)
      const nextGame = { ...current, players, activePlayer: playerIndex, tick: current.tick + 1 }
      setReplay(state => appendFrame(state, nextGame, elapsedMs))
      return nextGame
    })
  }, [editMode, syncElapsed])

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
      if (event.repeat) return
      const key = event.key.toLowerCase()

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
            setGame({ ...frameToGame(frame ?? currentReplay.frames[0], false), running: true })
            return
          }
          const elapsedMs = syncElapsed(current.running)
          const nextGame = { ...current, running: !current.running }
          setGame(nextGame)
          setReplay(state => appendFrame(state, nextGame, elapsedMs))
          setLiveElapsedMs(elapsedMs)
        }
        return
      }

      if (editMode) return
      const controls: Record<string, [0 | 1, Parameters<typeof updatePlayer>[1]]> = {
        arrowleft: [0,'left'], arrowright: [0,'right'], arrowup: [0,'rotate-right'], arrowdown: [0,'soft-drop'],
        a: [1,'left'], d: [1,'right'], w: [1,'rotate-right'], s: [1,'soft-drop'], q: [1,'rotate-left'], e: [1,'rotate-right'],
      }
      if (key === ' ') { event.preventDefault(); dispatch(gameRef.current.activePlayer, 'hard-drop'); return }
      const control = controls[key]
      if (control) { event.preventDefault(); dispatch(control[0], control[1]) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch, editMode, resetClock, syncElapsed])

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
      setGame(frameToGame(frame, false))
      setReplay(state => ({ ...state, cursor, playing: cursor < state.frames.length - 1 }))
    }, 40)
    return () => window.clearInterval(timer)
  }, [replay.playing, replay.speed, resetClock])

  const setMode = (index: 0 | 1, mode: PlayerState['controlMode']) => {
    const current = gameRef.current
    const elapsedMs = syncElapsed(current.running)
    const players = [...current.players] as [PlayerState, PlayerState]
    players[index] = { ...players[index], controlMode: mode }
    const nextReplaySelected = players.some(player => player.controlMode === 'replay')
    const nextGame = { ...current, players, running: nextReplaySelected ? false : true }
    setGame(nextGame)
    setReplay(state => appendFrame(state, nextGame, elapsedMs))
  }

  const reset = () => { const next = createGame(); setGame(next); setReplay(createReplay(next)); setMessage(''); setEditMode(false); resetClock(0) }

  const seekTime = (elapsedMs: number) => {
    setReplay(current => {
      if (current.frames.length === 0) return current
      const cursor = findFrameAtElapsed(current.frames, elapsedMs)
      const frame = current.frames[cursor]
      resetClock(frame.elapsedMs)
      setGame(frameToGame(frame, false))
      return { ...current, cursor, playing: false }
    })
  }

  const seek = (cursor: number) => {
    const frames = replayRef.current.frames
    const clamped = Math.max(0, Math.min(frames.length - 1, cursor))
    const frame = frames[clamped]
    if (frame) seekTime(frame.elapsedMs)
  }

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
      setGame(frameToGame(first, false))
      setReplay(state => ({ ...state, cursor: 0, playing: true }))
      return
    }
    setGame(current => ({ ...current, running: false }))
    setReplay(state => ({ ...state, playing: true }))
  }

  const changeNext = (index:number, part:'axis'|'child') => editPlayerState(player => { const pair = player.next[index]; return setNextPair(player,index,{ ...pair,[part]:nextColor(pair[part]) }) })
  const changeCurrentColor = (part:'axis'|'child') => editPlayerState(player => { const pair = player.current.pair; return setPairColors(player, part === 'axis' ? nextColor(pair.axis) : pair.axis, part === 'child' ? nextColor(pair.child) : pair.child) })
  const rotateCurrent = (delta:1|-1) => editPlayerState(player => setPairRotation(player,((player.current.rotation+delta+4)%4) as 0|1|2|3))
  const changeGarbage = (delta:number) => editPlayerState(player => setGarbage(player,player.garbage+delta))
  const setGarbageValue = (value:string) => editPlayerState(player => setGarbage(player,Number(value)||0))
  const editableControls: EditControls = { changeCurrentColor, rotateCurrent, changeNext, changeGarbage, setGarbageValue }

  const saveCurrentSnapshot = async () => { try { await saveSnapshot(makeSnapshot(game,snapshotTitle,snapshotTags.split(',').map(tag=>tag.trim()))); setSnapshotTitle(''); setSnapshotTags(''); setMessage('局面を保存しました'); await refreshSnapshots(); setLibraryOpen(true) } catch { setMessage('局面の保存に失敗しました') } }
  const loadSnapshot = (snapshot:Snapshot) => { const restored = cloneGameState(snapshot.state); setGame(restored); setReplay(createReplay(restored)); setLibraryOpen(false); setEditMode(false); setMessage(`「${snapshot.title}」を読み込みました`); resetClock(0) }
  const removeSnapshot = async (id:string) => { try { await deleteSnapshot(id); await refreshSnapshots(); setMessage('局面を削除しました') } catch { setMessage('局面の削除に失敗しました') } }

  const activeFrame = replay.frames[replay.cursor]
  const lastFrame = replay.frames[replay.frames.length - 1]
  const lastCursor = Math.max(0, replay.frames.length - 1)
  const currentTimelineMs = game.running && replay.cursor === lastCursor ? Math.max(activeFrame?.elapsedMs ?? 0, liveElapsedMs) : (activeFrame?.elapsedMs ?? 0)
  const timelineMaxMs = Math.max(lastFrame?.elapsedMs ?? 0, game.running && replay.cursor === lastCursor ? currentTimelineMs : 0)

  return <main className="app"><header className="topbar"><div><div className="eyebrow">PUZZLE COACHING LAB</div><h1>Puyo Trainer</h1></div><div className="header-actions"><span className="phase">Phase 4 · Editor</span><div className="editor-tabs inline-tabs">{(['A','B'] as const).map((label,index)=><button className={editPlayer===index?'selected':''} key={label} onClick={()=>setEditPlayer(index as 0|1)}>{editMode ? `編集 ${label}` : `Player ${label}`}</button>)}</div><button onClick={() => setLibraryOpen(v=>!v)}>局面ライブラリ {snapshots.length}</button><button onClick={reset}>新しいゲーム</button></div></header>
  <section className="snapshot-panel"><div><div className="aside-label">SNAPSHOT</div><strong>現在の局面を保存</strong><span>編集した盤面・組ぷよ・NEXT・おじゃまも保存されます</span></div><div className="snapshot-form"><input value={snapshotTitle} onChange={e=>setSnapshotTitle(e.target.value)} placeholder="局面名（例：2ダブ受け）"/><input value={snapshotTags} onChange={e=>setSnapshotTags(e.target.value)} placeholder="タグ（カンマ区切り）"/><button onClick={()=>void saveCurrentSnapshot()}>保存</button></div></section>
  {libraryOpen && <section className="library-panel"><div className="library-header"><div><div className="aside-label">SNAPSHOT LIBRARY</div><strong>保存局面 {snapshots.length} 件</strong></div><button onClick={()=>setLibraryOpen(false)}>閉じる</button></div>{snapshots.length===0?<div className="empty-library">まだ保存された局面はありません。</div>:<div className="snapshot-list">{snapshots.map(snapshot=><div className="snapshot-item" key={snapshot.id}><div className="snapshot-info"><strong>{snapshot.title}</strong><span>Tick {snapshot.sourceTick} · {new Date(snapshot.createdAt).toLocaleString('ja-JP')}</span>{snapshot.tags.length>0&&<div className="tags">{snapshot.tags.map(tag=><em key={tag}>{tag}</em>)}</div>}</div><div className="snapshot-actions"><button onClick={()=>loadSnapshot(snapshot)}>読み込む</button><button onClick={()=>void removeSnapshot(snapshot.id)}>削除</button></div></div>)}</div>}</section>}
  {message && <div className="status-message">{message}</div>}
  <section className="arena"><PlayerPanel title="A" player={game.players[0]} onMode={mode=>setMode(0,mode)} nextVisible={nextVisible} editMode={editMode&&editPlayer===0} onBoardChange={setEditedBoard} onPairEdit={setEditedPair} editableControls={editableControls}/><div className="vs"><span>VS</span><small>LOCAL</small><button className="board-edit-button" onClick={() => setEditMode(v=>!v)}>{editMode ? '編集終了' : '盤面を直接編集'}</button></div><PlayerPanel title="B" player={game.players[1]} onMode={mode=>setMode(1,mode)} nextVisible={nextVisible} editMode={editMode&&editPlayer===1} onBoardChange={setEditedBoard} onPairEdit={setEditedPair} editableControls={editableControls}/></section>
  <section className="replay-panel"><div className="replay-header"><div><div className="aside-label">TIMELINE</div><strong>{formatTime(currentTimelineMs)} / {formatTime(timelineMaxMs)}</strong></div><span>Frame {replay.cursor+1} / {replay.frames.length}</span></div><div className="timeline-wrap"><div className="timeline-labels"><span>0:00.0</span><span>{formatTime(currentTimelineMs)}</span><span>{game.running && replay.cursor === lastCursor ? 'LIVE' : formatTime(lastFrame?.elapsedMs ?? 0)}</span></div><input className="timeline" type="range" min="0" max={Math.max(1,timelineMaxMs)} step="10" value={Math.min(currentTimelineMs,Math.max(1,timelineMaxMs))} onChange={e=>seekTime(Number(e.target.value))} disabled={replay.frames.length < 2} aria-label="Game timeline"/></div><div className="replay-controls"><button onClick={()=>seek(0)} disabled={replay.frames.length < 2}>⏮</button><button onClick={()=>seek(replay.cursor-1)} disabled={replay.cursor <= 0}>◀</button><button className="play" onClick={togglePlayback} disabled={replay.frames.length < 2}>{replay.playing?'⏸':'▶'}</button><button onClick={()=>seek(replay.cursor+1)} disabled={replay.cursor >= lastCursor}>▶</button><button onClick={()=>seek(lastCursor)} disabled={replay.frames.length < 2}>⏭</button><div className="speed-buttons">{REPLAY_SPEEDS.map(speed=><button className={replay.speed===speed?'selected':''} key={speed} onClick={()=>setReplay(state=>({...state,speed}))}>{speed}x</button>)}</div></div><div className="replay-hint">タイムラインは常時利用可能 · プレイ中でもシーク可能 · 戻した地点からFキーで再開 · Replay選択時は自動再生</div></section>
  <section className="controls"><div><strong>A</strong> ← → 移動　↑ 回転　↓ 落下　Space ハードドロップ</div><div><strong>B</strong> A / D 移動　W / Q・E 回転　S 落下</div><div><strong>F</strong> ゲーム再開 / 停止</div></section><footer>独自ゲームエンジン · 公式素材・データ不使用 · Phase 4 Position Editor</footer></main>
}

function PlayerPanel({ title, player, onMode, nextVisible, editMode, onBoardChange, onPairEdit, editableControls }: { title:string; player:PlayerState; onMode:(mode:PlayerState['controlMode'])=>void; nextVisible:number; editMode:boolean; onBoardChange:(board:Board)=>void; onPairEdit:(pair:PairEdit)=>void; editableControls:EditControls }) { return <article className="player-card"><div className="player-header"><div><span className="player-label">PLAYER</span><h2>{title}</h2></div><span className={`mode ${player.alive ? player.controlMode : 'game-over'}`}>{player.alive?player.controlMode:'game-over'}</span></div><div className="game-row"><BoardView player={player} editMode={editMode} onBoardChange={onBoardChange} onPairEdit={onPairEdit}/><aside><div className="aside-label">NEXT</div><NextView player={{...player,next:player.next.slice(0,nextVisible)}} editable={editMode} onPair={editableControls.changeNext}/><div className="aside-label garbage-label">GARBAGE</div><div className="garbage">{player.garbage}</div><div className="combo-display"><div className="aside-label combo-label">COMBO</div><strong>{player.chain}</strong></div></aside></div>{editMode&&<div className="direct-edit-bar"><div className="current-pair"><button style={{background:COLOR_MAP[player.current.pair.axis]}} onClick={()=>editableControls.changeCurrentColor('axis')}>{COLOR_NAMES[player.current.pair.axis]}</button><button style={{background:COLOR_MAP[player.current.pair.child]}} onClick={()=>editableControls.changeCurrentColor('child')}>{COLOR_NAMES[player.current.pair.child]}</button><button onClick={()=>editableControls.rotateCurrent(-1)}>↶</button><button onClick={()=>editableControls.rotateCurrent(1)}>↷</button></div><div className="garbage-editor"><button onClick={()=>editableControls.changeGarbage(-1)}>−</button><input type="number" min="0" value={player.garbage} onChange={e=>editableControls.setGarbageValue(e.target.value)}/><button onClick={()=>editableControls.changeGarbage(1)}>＋</button></div></div>}<div className="mode-buttons">{(['human','fixed','replay','none'] as const).map(mode=><button className={player.controlMode===mode?'selected':''} key={mode} onClick={()=>onMode(mode)}>{mode}</button>)}</div></article> }
