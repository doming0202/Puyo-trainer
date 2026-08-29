import { useEffect, useState, type MouseEvent } from 'react'
import { COLS, GARBAGE_CELL, ROWS, isGarbageCell, type Board, type PuyoColor } from '../game/types'
import './DirectBoardEditor.css'

const COLORS: PuyoColor[] = [1, 2, 3, 4]
const COLOR_NAMES: Record<PuyoColor, string> = { 1: '赤', 2: '青', 3: '緑', 4: '紫' }
const COLOR_MAP: Record<PuyoColor, string> = { 1: '#ff5b68', 2: '#5aa7ff', 3: '#58d68d', 4: '#b66cff' }
const SELECTION_COLOR = 'rgba(255, 159, 67, 0.16)'
type Point = { x: number; y: number }
type PaintTool = PuyoColor | null
type DragMode = 'paint' | 'range' | null
const keyOf = (p: Point) => `${p.x},${p.y}`
const rangeKeys = (a: Point, b: Point) => {
  const out: string[] = []
  for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y += 1) {
    for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x += 1) out.push(`${x},${y}`)
  }
  return out
}

function paletteKey(color: PuyoColor): PuyoColor {
  return isGarbageCell(color) ? GARBAGE_CELL : color
}

function selectionColor(board: Board, selected: Set<string>): PuyoColor | null {
  if (selected.size === 0) return null
  let first: PuyoColor | null = null
  for (const key of selected) {
    const [x, y] = key.split(',').map(Number)
    const cell = board[y]?.[x] ?? null
    if (cell === null) return null
    const normalized = paletteKey(cell)
    if (first === null) first = normalized
    else if (first !== normalized) return null
  }
  return first
}

export function DirectBoardEditor({ board, onBoardChange, onPairEdit: _onPairEdit }: { board: Board; onBoardChange: (board: Board) => void; onPairEdit: (pair: { axis: PuyoColor; child: PuyoColor }) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<Point | null>(null)
  const [dragging, setDragging] = useState(false)
  const [dragMode, setDragMode] = useState<DragMode>(null)
  const [paintTool, setPaintTool] = useState<PaintTool>(1)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Delete') return
      if (!selected.size) return
      event.preventDefault()
      const next = board.map((row) => [...row])
      selected.forEach((key) => {
        const [x, y] = key.split(',').map(Number)
        next[y][x] = null
      })
      onBoardChange(next)
      setPaintTool(null)
      setSelected(new Set())
    }
    const up = () => {
      setDragging(false)
      setDragMode(null)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mouseup', up)
    }
  }, [board, onBoardChange, selected])

  const updateSelection = (next: Set<string>) => {
    setSelected(next)
    const inferred = selectionColor(board, next)
    if (inferred !== null) setPaintTool(inferred)
  }

  const applyPaint = (tool: PaintTool, keys = selected) => {
    setPaintTool(tool)
    if (!keys.size) return
    const next = board.map((row) => [...row])
    keys.forEach((key) => {
      const [x, y] = key.split(',').map(Number)
      next[y][x] = tool
    })
    onBoardChange(next)
  }

  const paintPoint = (point: Point) => {
    const key = keyOf(point)
    const one = new Set([key])
    setSelected(one)
    setAnchor(point)
    applyPaint(paintTool, one)
  }

  const select = (point: Point, event: MouseEvent) => {
    if (event.shiftKey && anchor) {
      updateSelection(new Set(rangeKeys(anchor, point)))
      return
    }

    if (event.ctrlKey || event.metaKey) {
      const next = new Set(selected)
      const key = keyOf(point)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      updateSelection(next)
      setAnchor(point)
      return
    }

    paintPoint(point)
  }

  const handleMouseDown = (point: Point, event: MouseEvent) => {
    if (event.button !== 0) return
    event.preventDefault()
    const selectionMode = (event.shiftKey && anchor) || event.ctrlKey || event.metaKey
    select(point, event)
    setDragging(true)
    setDragMode(selectionMode ? 'range' : 'paint')
  }

  const handleMouseEnter = (point: Point) => {
    if (!dragging || !anchor) return
    if (dragMode === 'range') {
      updateSelection(new Set(rangeKeys(anchor, point)))
      return
    }
    paintPoint(point)
  }

  return <>
    <div className="direct-editor-overlay" onMouseLeave={() => { setDragging(false); setDragMode(null) }}>
      {Array.from({ length: ROWS * COLS }, (_, index) => {
        const point = { x: index % COLS, y: Math.floor(index / COLS) }
        const key = keyOf(point)
        const hasPuyo = board[point.y][point.x] !== null
        const isSelected = selected.has(key)
        return <div
          key={key}
          className={`direct-editor-cell ${isSelected ? 'selected' : ''}`}
          style={isSelected ? { background: SELECTION_COLOR } : undefined}
          onMouseDown={(event) => handleMouseDown(point, event)}
          onMouseEnter={() => handleMouseEnter(point)}
          onContextMenu={(event) => event.preventDefault()}
        >
          {isSelected && hasPuyo && <span className="direct-editor-selection-frame" aria-hidden="true" />}
        </div>
      })}
    </div>

    {selected.size > 0 && <div className="direct-editor-selection">選択 {selected.size}マス</div>}

    <div className="direct-editor-palette" aria-label="編集用カラーパレット">
      <div className="direct-editor-palette-title">COLOR</div>
      {COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className={`direct-editor-palette-button ${paintTool === color ? 'selected' : ''}`}
          title={`${COLOR_NAMES[color]}を選択範囲へ適用`}
          aria-pressed={paintTool === color}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => applyPaint(color)}
        >
          <span className="direct-editor-palette-dot" style={{ background: COLOR_MAP[color] }} />
          <span>{COLOR_NAMES[color]}</span>
        </button>
      ))}
      <button
        type="button"
        className={`direct-editor-palette-button palette-obstruction ${paintTool === GARBAGE_CELL ? 'selected' : ''}`}
        title="妨害を選択範囲へ適用"
        aria-pressed={paintTool === GARBAGE_CELL}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={() => applyPaint(GARBAGE_CELL)}
      >
        <span className="direct-editor-palette-dot obstruction" />
        <span>妨害</span>
      </button>
      <button
        type="button"
        className={`direct-editor-palette-button palette-delete ${paintTool === null ? 'selected' : ''}`}
        title="選択範囲を削除"
        aria-pressed={paintTool === null}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={() => applyPaint(null)}
      >
        <span className="direct-editor-palette-delete-mark" aria-hidden="true">×</span>
        <span>削除</span>
      </button>
    </div>
  </>
}
