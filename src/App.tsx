import { useCallback, useEffect, useRef, useState } from 'react'
import { cellsOf, createGame, updatePlayer } from './game/engine'
import { COLS, ROWS, type GameState, type PlayerState, type PuyoColor } from './game/types'
import './styles.css'

const COLOR_MAP: Record<PuyoColor, string> = {
  1: '#ff5b68',
  2: '#ffd45a',
  3: '#58d68d',
  4: '#5aa7ff',
}

function BoardView({ player }: { player: PlayerState }) {
  const active = new Map(cellsOf(player.current).map((cell) => [`${cell.x},${cell.y}`, cell.color]))
  return (
    <div className="board" aria-label="ゲーム盤面">
      {Array.from({ length: ROWS * COLS }, (_, index) => {
        const x = index % COLS
        const y = Math.floor(index / COLS)
        const boardColor = player.board[y][x]
        const color = active.get(`${x},${y}`) ?? boardColor
        return <div className="cell" key={`${x}-${y}`}>{color && <span className="puyo" style={{ background: COLOR_MAP[color] }} />}</div>
      })}
    </div>
  )
}

function NextView({ player }: { player: PlayerState }) {
  return (
    <div className="next-list">
      {player.next.slice(0, 4).map((pair, index) => (
        <div className="next-pair" key={index}>
          <span className="mini-puyo" style={{ background: COLOR_MAP[pair.axis] }} />
          <span className="mini-puyo" style={{ background: COLOR_MAP[pair.child] }} />
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const [game, setGame] = useState<GameState>(() => createGame())
  const gameRef = useRef(game)
  gameRef.current = game

  const dispatch = useCallback((playerIndex: 0 | 1, action: Parameters<typeof updatePlayer>[1]) => {
    setGame((current) => {
      const player = current.players[playerIndex]
      if (player.controlMode !== 'human') return current
      const players: [PlayerState, PlayerState] = [...current.players] as [PlayerState, PlayerState]
      players[playerIndex] = updatePlayer(player, action)
      return { ...current, players, activePlayer: playerIndex, tick: current.tick + 1 }
    })
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      const key = event.key.toLowerCase()
      const controls: Record<string, [0 | 1, Parameters<typeof updatePlayer>[1]]> = {
        arrowleft: [0, 'left'], arrowright: [0, 'right'], arrowup: [0, 'rotate-right'], arrowdown: [0, 'soft-drop'],
        a: [1, 'left'], d: [1, 'right'], w: [1, 'rotate-right'], s: [1, 'soft-drop'],
        q: [1, 'rotate-left'], e: [1, 'rotate-right'],
      }
      if (key === ' ') {
        event.preventDefault()
        dispatch(gameRef.current.activePlayer, 'hard-drop')
        return
      }
      const control = controls[key]
      if (control) {
        event.preventDefault()
        dispatch(control[0], control[1])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setGame((current) => {
        if (!current.running) return current
        const players: [PlayerState, PlayerState] = [...current.players] as [PlayerState, PlayerState]
        players.forEach((player, index) => {
          if (player.controlMode === 'human') players[index] = updatePlayer(player, 'soft-drop')
        })
        return { ...current, players, tick: current.tick + 1 }
      })
    }, 900)
    return () => window.clearInterval(timer)
  }, [])

  const setMode = (index: 0 | 1, mode: PlayerState['controlMode']) => {
    setGame((current) => {
      const players: [PlayerState, PlayerState] = [...current.players] as [PlayerState, PlayerState]
      players[index] = { ...players[index], controlMode: mode }
      return { ...current, players }
    })
  }

  const reset = () => setGame(createGame())

  return (
    <main className="app">
      <header className="topbar">
        <div><div className="eyebrow">PUZZLE COACHING LAB</div><h1>Puyo Trainer</h1></div>
        <div className="header-actions"><span className="phase">Phase 1 · Game Engine</span><button onClick={reset}>新しいゲーム</button></div>
      </header>

      <section className="arena">
        <PlayerPanel title="A" player={game.players[0]} onMode={(mode) => setMode(0, mode)} />
        <div className="vs"><span>VS</span><small>LOCAL</small></div>
        <PlayerPanel title="B" player={game.players[1]} onMode={(mode) => setMode(1, mode)} />
      </section>

      <section className="controls">
        <div><strong>A</strong> ← → 移動　↑ 回転　↓ 落下　Space ハードドロップ</div>
        <div><strong>B</strong> A / D 移動　W / Q・E 回転　S 落下</div>
      </section>

      <footer>独自ゲームエンジン · 公式素材・データ不使用 · Replay / Snapshot は次フェーズで追加</footer>
    </main>
  )
}

function PlayerPanel({ title, player, onMode }: { title: string; player: PlayerState; onMode: (mode: PlayerState['controlMode']) => void }) {
  return (
    <article className="player-card">
      <div className="player-header"><div><span className="player-label">PLAYER</span><h2>{title}</h2></div><span className={`mode ${player.controlMode}`}>{player.controlMode}</span></div>
      <div className="game-row">
        <div><BoardView player={player} /><div className="score">SCORE <b>{player.score.toLocaleString()}</b>{player.chain > 0 && <span>CHAIN {player.chain}</span>}</div></div>
        <aside><div className="aside-label">NEXT</div><NextView player={player} /><div className="aside-label garbage-label">GARBAGE</div><div className="garbage">{player.garbage}</div></aside>
      </div>
      <div className="mode-buttons">{(['human', 'fixed', 'replay', 'none'] as const).map((mode) => <button className={player.controlMode === mode ? 'selected' : ''} key={mode} onClick={() => onMode(mode)}>{mode}</button>)}</div>
    </article>
  )
}
