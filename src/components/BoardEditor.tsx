import { useEffect, useRef, useState } from 'react'
import { COLS, ROWS, type Board, type PuyoColor } from '../game/types'

const COLORS: PuyoColor[] = [1, 2, 3, 4]
const COLOR_NAMES: Record<PuyoColor, string> = { 1: '赤', 2: '黄', 3: '緑', 4: '青' }
const COLOR_MAP: Record<PuyoColor, string> = { 1: '#ff5b68', 2: '#ffd45a', 3: '#58d68d', 4: '#5aa7ff' }

type Point = { x: number; y: number }
type Pair = { axis: PuyoColor; child: PuyoColor }

function keyOf(x: number, y: number) { return `${x},${y}` }
function pointFromKey(key: string): Point { const [x, y] = key.split(',').map(Number); return { x, y } }
function rangeKeys(a: Point, b: Point): string[] {
  const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x)
  const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y)
  const keys: string[] = []
  for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) keys.push(keyOf(x, y))
  return keys
}

export function BoardEditor({ board, onChange, onPair }: { board: Board; onChange: (board: Board) => void; onPair?: (pair: Pair) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dragging, setDragging] = useState(false)
  const [anchor, setAnchor] = useState<Point | null>(null)
  const [hover, setHover] = useState<Point | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [pairColor, setPairColor] = useState<PuyoColor | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' || selected.size === 0) return
      event.preventDefault()
      const next = board.map((row) => [...row])
      selected.forEach((key) => { const { x, y } = pointFromKey(key); next[y][x] = null })
      onChange(next)
      setSelected(new Set())
    }
    const onPointerDown = (event: PointerEvent) => {
      if (menu && !boardRef.current?.contains(event.target as Node)) setMenu(null)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('pointerdown', onPointerDown) }
  }, [board, menu, onChange, selected])

  const updateSelection = (point: Point, event: React.MouseEvent) => {
    if (event.shiftKey && anchor) {
      setSelected(new Set(rangeKeys(anchor, point)))
      return
    }
    if (event.ctrlKey || event.metaKey) {
      setSelected((current) => { const next = new Set(current); const key = keyOf(point.x, point.y); if (next.has(key)) next.delete(key); else next.add(key); return next })
      setAnchor(point)
      return
    }
    setSelected(new Set([keyOf(point.x, point.y)]))
    setAnchor(point)
  }

  const paint = (color: PuyoColor | null) => {
    if (selected.size === 0) return
    const next = board.map((row) => [...row])
    selected.forEach((key) => { const { x, y } = pointFromKey(key); next[y][x] = color })
    onChange(next)
    setMenu(null)
    setPairColor(null)
  }

  const handleContextMenu = (event: React.MouseEvent, point: Point) => {
    event.preventDefault()
    if (!selected.has(keyOf(point.x, point.y))) setSelected(new Set([keyOf(point.x, point.y)]))
    setAnchor(point)
    setPairColor(null)
    setMenu({ x: event.clientX, y: event.clientY })
  }

  const pairs = pairColor ? COLORS.map((child) => ({ axis: pairColor, child })) : []

  return <div className="board-editor-wrap" ref={boardRef}>
    <div className="board-editor-help">左クリック: 選択　Ctrl: 複数　Shift+ドラッグ: 範囲　Delete: 消去　右クリック: 色 / 組み合わせ</div>
    <div className="board board-editor" onMouseLeave={() => dragging && setHover(null)} onMouseUp={() => { setDragging(false); setHover(null) }}>
      {Array.from({ length: ROWS * COLS }, (_, index) => {
        const x = index % COLS, y = Math.floor(index / COLS), key = keyOf(x, y)
        const color = board[y][x]
        const isSelected = selected.has(key)
        const inPreview = dragging && anchor && hover ? rangeKeys(anchor, hover).includes(key) : false
        return <div className={`cell editor-cell ${isSelected || inPreview ? 'editor-selected' : ''}`} key={key}
          onMouseDown={(event) => { if (event.button !== 0) return; event.preventDefault(); const point = { x, y }; if (event.shiftKey) { setDragging(true); setAnchor(anchor ?? point); setHover(point); setSelected(new Set(rangeKeys(anchor ?? point, point))) } else { updateSelection(point, event); setDragging(true); setHover(point) } }}
          onMouseEnter={() => { if (dragging && anchor) { setHover({ x, y }); setSelected(new Set(rangeKeys(anchor, { x, y }))) } }}
          onContextMenu={(event) => handleContextMenu(event, { x, y })}>
          {color && <span className="puyo" style={{ background: COLOR_MAP[color] }} />}
        </div>
      })}
    </div>
    {selected.size > 0 && <div className="board-selection-info">選択: {selected.size}マス</div>}
    {menu && <div className="board-context-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(event) => event.stopPropagation()}>
      {!pairColor ? <><div className="context-title">配置する色</div><div className="context-colors">{COLORS.map((color) => <button key={color} className="context-color" onClick={() => paint(color)}><span className="context-dot" style={{ background: COLOR_MAP[color] }} />{COLOR_NAMES[color]}</button>)}</div><button className="context-clear" onClick={() => paint(null)}>消去</button><div className="context-divider" /><div className="context-title">組み合わせ</div><div className="context-colors">{COLORS.map((color) => <button key={color} className="context-color" onClick={() => setPairColor(color)}><span className="context-dot" style={{ background: COLOR_MAP[color] }} />{COLOR_NAMES[color]}を基準</button>)}</div></> : <><button className="context-back" onClick={() => setPairColor(null)}>← 色を選び直す</button><div className="context-title">{COLOR_NAMES[pairColor]} × 子ぷよ</div><div className="pair-grid">{pairs.map((pair) => <button key={`${pair.axis}-${pair.child}`} className="pair-option" onClick={() => { onPair?.(pair); paint(pair.axis) }}><span className="context-dot" style={{ background: COLOR_MAP[pair.axis] }} /><span className="pair-x">×</span><span className="context-dot" style={{ background: COLOR_MAP[pair.child] }} /><small>{COLOR_NAMES[pair.axis]}×{COLOR_NAMES[pair.child]}</small></button>)}</div></>}
    </div>}
  </div>
}
