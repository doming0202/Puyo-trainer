import { useCallback, useEffect, useRef, useState } from 'react'
import { advanceResolution, cellsOf, createGame, updatePlayer } from './game/engine'
import { EDITABLE_COLORS, setGarbage, setNextPair, setPairColors, setPairRotation } from './game/editor'
import { appendFrame, createReplay, frameToGame, moveCursor, REPLAY_SPEEDS, type ReplayState } from './game/replay'
import { cloneGameState, deleteSnapshot, listSnapshots, makeSnapshot, saveSnapshot, type Snapshot } from './game/snapshots'
import { COLS, ROWS, type Board, type GameState, type Pair, type PlayerState, type PuyoColor } from './game/types'
import { DirectBoardEditor } from './components/DirectBoardEditor'
import './styles.css'

const COLOR_MAP: Record<PuyoColor, string> = { 1: '#ff5b68', 2: '#ffd45a', 3: '#58d68d', 4: '#5aa7ff', 5: '#b66cff' }
const COLOR_NAMES: Record<PuyoColor, string> = { 1: '赤', 2: '黄', 3: '緑', 4: '青', 5: '紫' }

type Pair = { axis: PuyoColor; child: PuyoColor }

function BoardView({ player, editMode, onBoardChange, onPairEdit }: { player: PlayerState; editMode?: boolean; onBoardChange?: (board: Board) => void; onPairEdit?: (pair: Pair) => void }) {
  const active = player.resolution ? new Map<string, PuyoColor>() : new Map(cellsOf(player.current).map((cell) => [`${cell.x},${cell.y}`, cell.color]))
  const clearing = new Set((player.resolution?.pendingGroups ?? []).flatMap((group) => group.map(({ x, y }) => `${x},${y}`)))
  return <div className="board-stage"><div className="board-wrap"><div className="board" aria-label="ゲーム盤面">{Array.from({ length: ROWS * COLS }, (_, index) => { const x = index % COLS, y = Math.floor(index / COLS), key = `${x},${y}`; const color = active.get(key) ?? player.board[y][x]; return <div className={`cell ${clearing.has(key) ? 'clearing-cell' : ''}`} key={key}>{color && <span className="puyo" style={{ background: COLOR_MAP[color] }} />}</div> })}</div>{editMode && onBoardChange && onPairEdit && <DirectBoardEditor board={player.board} onBoardChange={onBoardChange} onPairEdit={onPairEdit} />}</div><div className="score">SCORE <b>{player.score.toLocaleString()}</b></div></div>
}

function NextView({ player, editable, onPair }: { player: PlayerState; editable?: boolean; onPair?: (index: number, part: 'axis' | 'child', color: PuyoColor) => void }) { return <div className="next-list">{player.next.slice(0, 4).map((pair, index) => <div className={`next-pair ${editable ? 'next-editable' : ''}`} key={index}><span className="next-index">N{index + 1}</span><button disabled={!editable} className="mini-puyo" style={{ background: COLOR_MAP[pair.axis] }} onClick={() => onPair?.(index, 'axis', nextColor(pair.axis))}>{COLOR_NAMES[pair.axis]}</button><button disabled={!editable} className="mini-puyo" style={{ background: COLOR_MAP[pair.child] }} onClick={() => onPair?.(index, 'child', nextColor(pair.child))}>{COLOR_NAMES[pair.child]}</button></div>)}</div> }
function nextColor(color: PuyoColor): PuyoColor { const index = EDITABLE_COLORS.indexOf(color); return EDITABLE_COLORS[(index + 1) % EDITABLE_COLORS.length] }
function countBoardColors(player: PlayerState): Record<PuyoColor, number> { const counts: Record<PuyoColor, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }; player.board.forEach(row => row.forEach(cell => { if (cell !== null && cell >= 1 && cell <= 5) counts[cell] += 1 })); if (!player.resolution) cellsOf(player.current).forEach(({ color }) => { counts[color] += 1 }); return counts }

export default function App() {
  const [game, setGame] = useState<GameState>(() => createGame())
  const [replay, setReplay] = useState<ReplayState>(() => createReplay(game))
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editPlayer, setEditPlayer] = useState<0 | 1>(0)
  const [nextVisible, setNextVisible] = useState(4)
  const [snapshotTitle, setSnapshotTitle] = useState('')
  const [snapshotTags, setSnapshotTags] = useState('')
  const [message, setMessage] = useState('')
  const gameRef = useRef(game); gameRef.current = game

  const refreshSnapshots = useCallback(async () => { try { setSnapshots(await listSnapshots()) } catch { setMessage('局面ライブラリを読み込めませんでした') } }, []); useEffect(() => { void refreshSnapshots() }, [refreshSnapshots])
  const editPlayerState = (fn: (player: PlayerState) => PlayerState) => setGame(current => { const players = [...current.players] as [PlayerState, PlayerState]; players[editPlayer] = fn(players[editPlayer]); return { ...current, players } })
  const setEditedBoard = (board: Board) => editPlayerState(player => ({ ...player, board }))
  const setEditedPair = (pair: Pair) => editPlayerState(player => setPairColors(player, pair.axis, pair.child))
  const dispatch = useCallback((playerIndex: 0 | 1, action: Parameters<typeof updatePlayer>[1]) => { setGame(current => { const player = current.players[playerIndex]; if (editMode || !player.alive || player.controlMode !== 'human' || !current.running) return current; const players = [...current.players] as [PlayerState, PlayerState]; players[playerIndex] = updatePlayer(player, action); const nextGame = { ...current, players, activePlayer: playerIndex, tick: current.tick + 1 }; setReplay(r => appendFrame(r, nextGame)); return nextGame }) }, [editMode])

  const replaySelected = game.players.some(player => player.controlMode === 'replay')
  const previousReplaySelected = useRef(replaySelected)

  useEffect(() => {
    if (replaySelected !== previousReplaySelected.current) {
      setReplay(current => {
        if (replaySelected) {
          if (current.frames.length < 2) return { ...current, playing: false }
          if (current.cursor >= current.frames.length - 1) return { ...current, cursor: 0, playing: true }
          return { ...current, playing: true }
        }
        return { ...current, playing: false }
      })
      previousReplaySelected.current = replaySelected
    }
  }, [replaySelected])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      const key = event.key.toLowerCase()

      if (key === 'f') {
        if (!editMode && replaySelected) {
          event.preventDefault()
          setReplay(current => {
            if (current.frames.length < 2) return current
            if (current.cursor >= current.frames.length - 1) {
              return { ...current, cursor: 0, playing: true }
            }
            return { ...current, playing: !current.playing }
          })
        }
        return
      }

      if (editMode) return
      const controls: Record<string, [0 | 1, Parameters<typeof updatePlayer>[1]]> = { arrowleft: [0,'left'], arrowright: [0,'right'], arrowup: [0,'rotate-right'], arrowdown: [0,'soft-drop'], a: [1,'left'], d: [1,'right'], w: [1,'rotate-right'], s: [1,'soft-drop'], q: [1,'rotate-left'], e: [1,'rotate-right'] }
      if (key === ' ') { event.preventDefault(); dispatch(gameRef.current.activePlayer, 'hard-drop'); return }
      const control = controls[key]
      if (control) { event.preventDefault(); dispatch(control[0], control[1]) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch, editMode, replaySelected])

  useEffect(() => { const timer = window.setInterval(() => setGame(current => { if (!current.running || editMode || replaySelected) return current; const players = [...current.players] as [PlayerState, PlayerState]; players.forEach((player, index) => { if (player.controlMode === 'human' && player.alive && !player.resolution) players[index] = updatePlayer(player, 'soft-drop') }); const nextGame = { ...current, players, tick: current.tick + 1 }; setReplay(r => appendFrame(r, nextGame)); return nextGame }), 900); return () => window.clearInterval(timer) }, [editMode, replaySelected])
  useEffect(() => { const timer = window.setInterval(() => setGame(current => { if (!current.running || editMode || replaySelected || !current.players.some(player => player.resolution)) return current; const players = [...current.players] as [PlayerState, PlayerState]; players.forEach((player,index) => { if (player.resolution) players[index] = advanceResolution(player) }); const nextGame = { ...current, players, tick: current.tick + 1 }; setReplay(r => appendFrame(r, nextGame)); return nextGame }), 420); return () => window.clearInterval(timer) }, [editMode, replaySelected])
  useEffect(() => { const timer = window.setInterval(() => setReplay(current => { if (editMode || !replaySelected || !current.playing || current.frames.length < 2) return current; const next = moveCursor(current,1); setGame(frameToGame(next.frames[next.cursor], false)); return next.cursor === current.frames.length - 1 ? { ...next, playing:false } : next }), Math.max(40,250 / replay.speed)); return () => window.clearInterval(timer) }, [replay.speed, editMode, replaySelected])

  const setMode = (index: 0 | 1, mode: PlayerState['controlMode']) => setGame(current => {
    const players = [...current.players] as [PlayerState, PlayerState]
    players[index] = { ...players[index], controlMode: mode }
    const nextReplaySelected = players.some(player => player.controlMode === 'replay')
    return { ...current, players, running: nextReplaySelected ? false : true }
  })
  const reset = () => { const next = createGame(); setGame(next); setReplay(createReplay(next)); setMessage(''); setEditMode(false) }
  const seek = (cursor:number) => {
    if (!replaySelected) return
    setReplay(current => { const next = { ...current, cursor: Math.max(0,Math.min(current.frames.length-1,cursor)), playing:false }; setGame(frameToGame(next.frames[next.cursor], false)); return next })
  }
  const togglePlayback = () => {
    if (!replaySelected) return
    setReplay(current => current.frames.length < 2 ? current : current.cursor >= current.frames.length-1 ? { ...current, cursor:0, playing:true } : { ...current, playing:!current.playing })
  }
  const changeNext = (index:number, part:'axis'|'child') => editPlayerState(player => { const pair = player.next[index]; return setNextPair(player,index,{ ...pair,[part]:nextColor(pair[part]) }) }); const changeCurrentColor = (part:'axis'|'child') => editPlayerState(player => { const pair = player.current.pair; return setPairColors(player, part === 'axis' ? nextColor(pair.axis) : pair.axis, part === 'child' ? nextColor(pair.child) : pair.child) }); const rotateCurrent = (delta:1|-1) => editPlayerState(player => setPairRotation(player,((player.current.rotation+delta+4)%4) as 0|1|2|3)); const changeGarbage = (delta:number) => editPlayerState(player => setGarbage(player,player.garbage+delta)); const setGarbageValue = (value:string) => editPlayerState(player => setGarbage(player,Number(value)||0))
  const saveCurrentSnapshot = async () => { try { await saveSnapshot(makeSnapshot(game,snapshotTitle,snapshotTags.split(',').map(tag=>tag.trim()))); setSnapshotTitle(''); setSnapshotTags(''); setMessage('局面を保存しました'); await refreshSnapshots(); setLibraryOpen(true) } catch { setMessage('局面の保存に失敗しました') } }; const loadSnapshot = (snapshot:Snapshot) => { const restored = cloneGameState(snapshot.state); setGame(restored); setReplay(createReplay(restored)); setLibraryOpen(false); setEditMode(false); setMessage(`「${snapshot.title}」を読み込みました`) }; const removeSnapshot = async (id:string) => { try { await deleteSnapshot(id); await refreshSnapshots(); setMessage('局面を削除しました') } catch { setMessage('局面の削除に失敗しました') } }; const activeFrame = replay.frames[replay.cursor]
  return <main className="app"><header className="topbar"><div><div className="eyebrow">PUZZLE COACHING LAB</div><h1>Puyo Trainer</h1></div><div className="header-actions"><span className="phase">Phase 4 · Editor</span><button onClick={() => setEditMode(v => !v)}>{editMode ? '編集終了' : '盤面を直接編集'}</button><div className="editor-tabs inline-tabs">{(['A','B'] as const).map((label,index)=><button className={editPlayer===index?'selected':''} key={label} onClick={()=>setEditPlayer(index as 0|1)}>{editMode ? `編集 ${label}` : `Player ${label}`}</button>)}</div><button onClick={() => setLibraryOpen(v=>!v)}>局面ライブラリ {snapshots.length}</button><button onClick={reset}>新しいゲーム</button></div></header>
  <section className="snapshot-panel"><div><div className="aside-label">SNAPSHOT</div><strong>現在の局面を保存</strong><span>編集した盤面・組ぷよ・NEXT・おじゃまも保存されます</span></div><div className="snapshot-form"><input value={snapshotTitle} onChange={e=>setSnapshotTitle(e.target.value)} placeholder="局面名（例：2ダブ受け）"/><input value={snapshotTags} onChange={e=>setSnapshotTags(e.target.value)} placeholder="タグ（カンマ区切り）"/><button onClick={()=>void saveCurrentSnapshot()}>保存</button></div></section>
  {libraryOpen && <section className="library-panel"><div className="library-header"><div><div className="aside-label">SNAPSHOT LIBRARY</div><strong>保存局面 {snapshots.length} 件</strong></div><button onClick={()=>setLibraryOpen(false)}>閉じる</button></div>{snapshots.length===0?<div className="empty-library">まだ保存された局面はありません。</div>:<div className="snapshot-list">{snapshots.map(snapshot=><div className="snapshot-item" key={snapshot.id}><div className="snapshot-info"><strong>{snapshot.title}</strong><span>Tick {snapshot.sourceTick} · {new Date(snapshot.createdAt).toLocaleString('ja-JP')}</span>{snapshot.tags.length>0&&<div className="tags">{snapshot.tags.map(tag=><em key={tag}>{tag}</em>)}</div>}</div><div className="snapshot-actions"><button onClick={()=>loadSnapshot(snapshot)}>読み込む</button><button onClick={()=>void removeSnapshot(snapshot.id)}>削除</button></div></div>)}</div>}</section>}
  {message && <div className="status-message">{message}</div>}
  <section className="arena"><PlayerPanel title="A" player={game.players[0]} onMode={mode=>setMode(0,mode)} nextVisible={nextVisible} editMode={editMode&&editPlayer===0} onBoardChange={setEditedBoard} onPairEdit={setEditedPair} editableControls={{changeCurrentColor,rotateCurrent,changeNext,changeGarbage,setGarbageValue}}/><div className="vs"><span>VS</span><small>LOCAL</small></div><PlayerPanel title="B" player={game.players[1]} onMode={mode=>setMode(1,mode)} nextVisible={nextVisible} editMode={editMode&&editPlayer===1} onBoardChange={setEditedBoard} onPairEdit={setEditedPair} editableControls={{changeCurrentColor,rotateCurrent,changeNext,changeGarbage,setGarbageValue}}/></section>
  <section className="replay-panel"><div className="replay-header"><div><div className="aside-label">REPLAY</div><strong>Frame {replay.cursor+1} / {replay.frames.length}</strong></div><span>{activeFrame?.tick??0} tick</span></div><input className="timeline" type="range" min="0" max={Math.max(0,replay.frames.length-1)} value={replay.cursor} onChange={e=>seek(Number(e.target.value))}/><div className="replay-controls"><button onClick={()=>seek(0)} disabled={!replaySelected}>⏮</button><button onClick={()=>setReplay(r=>{if(!replaySelected)return r;const n=moveCursor(r,-1);setGame(frameToGame(n.frames[n.cursor],false));return {...n,playing:false}})} disabled={!replaySelected}>◀</button><button className="play" onClick={togglePlayback} disabled={!replaySelected}>{replay.playing?'⏸':'▶'}</button><button onClick={()=>setReplay(r=>{if(!replaySelected)return r;const n=moveCursor(r,1);setGame(frameToGame(n.frames[n.cursor],false));return {...n,playing:false}})} disabled={!replaySelected}>▶</button><button onClick={()=>seek(replay.frames.length-1)} disabled={!replaySelected}>⏭</button><div className="speed-buttons">{REPLAY_SPEEDS.map(speed=><button className={replay.speed===speed?'selected':''} key={speed} onClick={()=>setReplay(r=>({...r,speed}))}>{speed}x</button>)}</div></div><div className="replay-hint">REPLAY選択中のみ再生 · Fキーで再生 / 停止</div></section>
  <section className="controls"><div><strong>A</strong> ← → 移動　↑ 回転　↓ 落下　Space ハードドロップ</div><div><strong>B</strong> A / D 移動　W / Q・E 回転　S 落下</div></section><footer>独自ゲームエンジン · 公式素材・データ不使用 · Phase 4 Position Editor</footer></main>
}

type EditControls = { changeCurrentColor:(part:'axis'|'child')=>void; rotateCurrent:(delta:1|-1)=>void; changeNext:(index:number,part:'axis'|'child')=>void; changeGarbage:(delta:number)=>void; setGarbageValue:(value:string)=>void }
function PlayerPanel({ title, player, onMode, nextVisible, editMode, onBoardChange, onPairEdit, editableControls }: { title:string; player:PlayerState; onMode:(mode:PlayerState['controlMode'])=>void; nextVisible:number; editMode:boolean; onBoardChange:(board:Board)=>void; onPairEdit:(pair:Pair)=>void; editableControls:EditControls }) { const counts=countBoardColors(player); return <article className="player-card"><div className="player-header"><div><span className="player-label">PLAYER</span><h2>{title}</h2></div><span className={`mode ${player.alive ? player.controlMode : 'game-over'}`}>{player.alive?player.controlMode:'game-over'}</span></div><div className="game-row"><BoardView player={player} editMode={editMode} onBoardChange={onBoardChange} onPairEdit={onPairEdit}/><aside><div className="aside-label">NEXT</div><NextView player={{...player,next:player.next.slice(0,nextVisible)}} editable={editMode} onPair={editableControls.changeNext}/><div className="aside-label garbage-label">GARBAGE</div><div className="garbage">{player.garbage}</div><div className="color-counts"><div className="aside-label color-counts-title">PUYO COUNT</div>{([1,2,3,4,5] as const).map(color=><div className="color-count-row" key={color}><span className="color-dot" style={{background:COLOR_MAP[color]}}/><span className="color-name">{COLOR_NAMES[color]}</span><strong>{counts[color]}</strong></div>)}</div></aside></div>{editMode&&<div className="direct-edit-bar"><div className="current-pair"><button style={{background:COLOR_MAP[player.current.pair.axis]}} onClick={()=>editableControls.changeCurrentColor('axis')}>{COLOR_NAMES[player.current.pair.axis]}</button><button style={{background:COLOR_MAP[player.current.pair.child]}} onClick={()=>editableControls.changeCurrentColor('child')}>{COLOR_NAMES[player.current.pair.child]}</button><button onClick={()=>editableControls.rotateCurrent(-1)}>↶</button><button onClick={()=>editableControls.rotateCurrent(1)}>↷</button></div><div className="garbage-editor"><button onClick={()=>editableControls.changeGarbage(-1)}>−</button><input type="number" min="0" value={player.garbage} onChange={e=>editableControls.setGarbageValue(e.target.value)}/><button onClick={()=>editableControls.changeGarbage(1)}>＋</button></div></div>}<div className="mode-buttons">{(['human','fixed','replay','none'] as const).map(mode=><button className={player.controlMode===mode?'selected':''} key={mode} onClick={()=>onMode(mode)}>{mode}</button>)}</div></article> }
