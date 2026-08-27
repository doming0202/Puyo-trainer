import { useEffect, useState, type MouseEvent } from 'react'
import { COLS, ROWS, type Board, type PuyoColor } from '../game/types'

const COLORS: PuyoColor[] = [1, 2, 3, 4]
const COLOR_NAMES: Record<PuyoColor, string> = { 1: '赤', 2: '黄', 3: '緑', 4: '青' }
const COLOR_MAP: Record<PuyoColor, string> = { 1: '#ff5b68', 2: '#ffd45a', 3: '#58d68d', 4: '#5aa7ff' }
type Point = { x: number; y: number }
type Pair = { axis: PuyoColor; child: PuyoColor }
const keyOf = (p: Point) => `${p.x},${p.y}`
const rangeKeys = (a: Point, b: Point) => { const out: string[] = []; for (let y = Math.min(a.y,b.y); y <= Math.max(a.y,b.y); y++) for (let x = Math.min(a.x,b.x); x <= Math.max(a.x,b.x); x++) out.push(`${x},${y}`); return out }

export function DirectBoardEditor({ board, onBoardChange, onPairEdit }: { board: Board; onBoardChange: (board: Board) => void; onPairEdit: (pair: Pair) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<Point | null>(null)
  const [dragging, setDragging] = useState(false)
  const [menu, setMenu] = useState<{x:number;y:number}|null>(null)
  const [pairAxis, setPairAxis] = useState<PuyoColor | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key !== 'Delete' || !selected.size) return; e.preventDefault(); const next = board.map(r => [...r]); selected.forEach(k => { const [x,y] = k.split(',').map(Number); next[y][x] = null }); onBoardChange(next); setSelected(new Set()); setMenu(null) }
    const up = () => setDragging(false)
    window.addEventListener('keydown', onKey); window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mouseup', up) }
  }, [board,onBoardChange,selected])

  const select = (p:Point,e:MouseEvent) => { setMenu(null); if(e.shiftKey&&anchor){setSelected(new Set(rangeKeys(anchor,p)));return} if(e.ctrlKey||e.metaKey){setSelected(cur=>{const n=new Set(cur);const k=keyOf(p);n.has(k)?n.delete(k):n.add(k);return n});setAnchor(p);return} setSelected(new Set([keyOf(p)]));setAnchor(p) }
  const paint = (color:PuyoColor|null) => { if(!selected.size)return; const next=board.map(r=>[...r]);selected.forEach(k=>{const[x,y]=k.split(',').map(Number);next[y][x]=color});onBoardChange(next);setSelected(new Set());setMenu(null);setPairAxis(null) }
  const choosePair = (child:PuyoColor) => { if(pairAxis===null)return; onPairEdit({axis:pairAxis,child}); paint(pairAxis) }
  const context = (e:MouseEvent,p:Point) => { e.preventDefault();if(!selected.has(keyOf(p)))setSelected(new Set([keyOf(p)]));setAnchor(p);setPairAxis(null);setMenu({x:e.clientX,y:e.clientY}) }

  return <>
    <div className="direct-editor-overlay" onMouseLeave={()=>dragging&&setDragging(false)}>{Array.from({length:ROWS*COLS},(_,i)=>{const p={x:i%COLS,y:Math.floor(i/COLS)},k=keyOf(p);return <div key={k} className={`direct-editor-cell ${selected.has(k)?'selected':''}`} onMouseDown={e=>{if(e.button!==0)return;e.preventDefault();select(p,e);setDragging(true)}} onMouseEnter={()=>{if(dragging&&anchor)setSelected(new Set(rangeKeys(anchor,p)))}} onContextMenu={e=>context(e,p)}/>})}</div>
    {selected.size>0&&<div className="direct-editor-selection">選択 {selected.size}マス</div>}
    {menu&&<div className="direct-editor-menu" style={{left:menu.x,top:menu.y}} onMouseDown={e=>e.stopPropagation()}>{pairAxis===null?<><div className="context-title">色を選択</div><div className="context-colors">{COLORS.map(c=><button key={c} className="context-color" onClick={()=>setPairAxis(c)}><span className="context-dot" style={{background:COLOR_MAP[c]}}/>{COLOR_NAMES[c]}</button>)}</div><button className="context-clear" onClick={()=>paint(null)}>消去</button></>:<><button className="context-back" onClick={()=>setPairAxis(null)}>← 色を戻す</button><div className="context-title">{COLOR_NAMES[pairAxis]} × 組み合わせ</div><div className="pair-grid">{COLORS.map(child=><button key={child} className="pair-option" onClick={()=>choosePair(child)}><span className="context-dot" style={{background:COLOR_MAP[pairAxis]}}/><span className="pair-x">×</span><span className="context-dot" style={{background:COLOR_MAP[child]}}/><small>{COLOR_NAMES[pairAxis]}×{COLOR_NAMES[child]}</small></button>)}</div></>}</div>}
  </>
}
