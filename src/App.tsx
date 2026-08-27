import { useCallback, useEffect, useRef, useState } from 'react'
import { cellsOf, createGame, updatePlayer } from './game/engine'
import { appendFrame, createReplay, frameToGame, moveCursor, REPLAY_SPEEDS, type ReplayState } from './game/replay'
import { COLS, ROWS, type GameState, type PlayerState, type PuyoColor } from './game/types'
import './styles.css'

const COLOR_MAP: Record<PuyoColor, string> = { 1: '#ff5b68', 2: '#ffd45a', 3: '#58d68d', 4: '#5aa7ff' }

function BoardView({ player }: { player: PlayerState }) {
  const active = new Map(cellsOf(player.current).map((cell) => [`${cell.x},${cell.y}`, cell.color]))
  return <div className="board" aria-label="ゲーム盤面">{Array.from({ length: ROWS * COLS }, (_, index) => {
    const x = index % COLS, y = Math.floor(index / COLS)
    const color = active.get(`${x},${y}`) ?? player.board[y][x]
    return <div className="cell" key={`${x}-${y}`}>{color && <span className="puyo" style={{ background: COLOR_MAP[color] }} />}</div>
  })}</div>
}

function NextView({ player }: { player: PlayerState }) {
  return <div className="next-list">{player.next.slice(0, 4).map((pair, index) => <div className="next-pair" key={index}>
    <span className="mini-puyo" style={{ background: COLOR_MAP[pair.axis] }} /><span className="mini-puyo" style={{ background: COLOR_MAP[pair.child] }} />
  </div>)}</div>
}

export default function App() {
  const [game, setGame] = useState<GameState>(() => createGame())
  const [replay, setReplay] = useState<ReplayState>(() => createReplay(game))
  const gameRef = useRef(game); gameRef.current = game
  const replayRef = useRef(replay); replayRef.current = replay

  const dispatch = useCallback((playerIndex: 0 | 1, action: Parameters<typeof updatePlayer>[1]) => {
    setGame((current) => {
      const player = current.players[playerIndex]
      if (player.controlMode !== 'human' || !current.running) return current
      const players: [PlayerState, PlayerState] = [...current.players] as [PlayerState, PlayerState]
      players[playerIndex] = updatePlayer(player, action)
      const nextGame = { ...current, players, activePlayer: playerIndex, tick: current.tick + 1 }
      setReplay((r) => appendFrame(r, nextGame))
      return nextGame
    })
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      const key = event.key.toLowerCase()
      const controls: Record<string, [0 | 1, Parameters<typeof updatePlayer>[1]]> = {
        arrowleft: [0, 'left'], arrowright: [0, 'right'], arrowup: [0, 'rotate-right'], arrowdown: [0, 'soft-drop'],
        a: [1, 'left'], d: [1, 'right'], w: [1, 'rotate-right'], s: [1, 'soft-drop'], q: [1, 'rotate-left'], e: [1, 'rotate-right'],
      }
      if (key === ' ') { event.preventDefault(); dispatch(gameRef.current.activePlayer, 'hard-drop'); return }
      const control = controls[key]
      if (control) { event.preventDefault(); dispatch(control[0], control[1]) }
    }
    window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch])

  useEffect(() => {
    const timer = window.setInterval(() => setGame((current) => {
      if (!current.running) return current
      const players: [PlayerState, PlayerState] = [...current.players] as [PlayerState, PlayerState]
      players.forEach((player, index) => { if (player.controlMode === 'human') players[index] = updatePlayer(player, 'soft-drop') })
      const nextGame = { ...current, players, tick: current.tick + 1 }
      setReplay((r) => appendFrame(r, nextGame)); return nextGame
    }), 900)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setReplay((current) => {
      if (!current.playing || current.frames.length < 2) return current
      const next = moveCursor(current, 1)
      if (next.cursor === current.frames.length - 1) return { ...next, playing: false }
      setGame(frameToGame(next.frames[next.cursor], false)); return next
    }), Math.max(40, 250 / replay.speed))
    return () => window.clearInterval(timer)
  }, [replay.speed])

  const setMode = (index: 0 | 1, mode: PlayerState['controlMode']) => setGame((current) => {
    const players: [PlayerState, PlayerState] = [...current.players] as [PlayerState, PlayerState]
    players[index] = { ...players[index], controlMode: mode }; return { ...current, players }
  })

  const reset = () => { const next = createGame(); setGame(next); setReplay(createReplay(next)) }
  const seek = (cursor: number) => setReplay((current) => {
    const next = { ...current, cursor: Math.max(0, Math.min(current.frames.length - 1, cursor)), playing: false }
    setGame(frameToGame(next.frames[next.cursor], false)); return next
  })
  const togglePlayback = () => setReplay((current) => {
    if (current.frames.length < 2) return current
    if (current.cursor >= current.frames.length - 1) return { ...current, cursor: 0, playing: true }
    return { ...current, playing: !current.playing }
  })
  const activeFrame = replay.frames[replay.cursor]

  return <main className="app">
    <header className="topbar"><div><div className="eyebrow">PUZZLE COACHING LAB</div><h1>Puyo Trainer</h1></div><div className="header-actions"><span className="phase">Phase 2 · Replay</span><button onClick={reset}>新しいゲーム</button></div></header>
    <section className="arena"><PlayerPanel title="A" player={game.players[0]} onMode={(mode) => setMode(0, mode)} /><div className="vs"><span>VS</span><small>LOCAL</small></div><PlayerPanel title="B" player={game.players[1]} onMode={(mode) => setMode(1, mode)} /></section>
    <section className="replay-panel">
      <div className="replay-header"><div><div className="aside-label">REPLAY</div><strong>Frame {replay.cursor + 1} / {replay.frames.length}</strong></div><span>{activeFrame?.tick ?? 0} tick</span></div>
      <input className="timeline" type="range" min="0" max={Math.max(0, replay.frames.length - 1)} value={replay.cursor} onChange={(e) => seek(Number(e.target.value))} />
      <div className="replay-controls"><button onClick={() => seek(0)}>⏮</button><button onClick={() => setReplay((r) => { const n = moveCursor(r, -1); setGame(frameToGame(n.frames[n.cursor], false)); return { ...n, playing: false } })}>◀</button><button className="play" onClick={togglePlayback}>{replay.playing ? '⏸' : '▶'}</button><button onClick={() => setReplay((r) => { const n = moveCursor(r, 1); setGame(frameToGame(n.frames[n.cursor], false)); return { ...n, playing: false } })}>▶</button><button onClick={() => seek(replay.frames.length - 1)}>⏭</button>
        <div className="speed-buttons">{REPLAY_SPEEDS.map((speed) => <button className={replay.speed === speed ? 'selected' : ''} key={speed} onClick={() => setReplay((r) => ({ ...r, speed }))}>{speed}x</button>)}</div></div>
    </section>
    <section className="controls"><div><strong>A</strong> ← → 移動　↑ 回転　↓ 落下　Space ハードドロップ</div><div><strong>B</strong> A / D 移動　W / Q・E 回転　S 落下</div></section>
    <footer>独自ゲームエンジン · 公式素材・データ不使用 · Replay frame-based</footer>
  </main>
}

function PlayerPanel({ title, player, onMode }: { title: string; player: PlayerState; onMode: (mode: PlayerState['controlMode']) => void }) {
  return <article className="player-card"><div className="player-header"><div><span className="player-label">PLAYER</span><h2>{title}</h2></div><span className={`mode ${player.controlMode}`}>{player.controlMode}</span></div><div className="game-row"><div><BoardView player={player} /><div className="score">SCORE <b>{player.score.toLocaleString()}</b>{player.chain > 0 && <span>CHAIN {player.chain}</span>}</div></div><aside><div className="aside-label">NEXT</div><NextView player={player} /><div className="aside-label garbage-label">GARBAGE</div><div className="garbage">{player.garbage}</div></aside></div><div className="mode-buttons">{(['human', 'fixed', 'replay', 'none'] as const).map((mode) => <button className={player.controlMode === mode ? 'selected' : ''} key={mode} onClick={() => onMode(mode)}>{mode}</button>)}</div></article>
}
