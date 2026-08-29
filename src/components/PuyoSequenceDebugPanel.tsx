import { useEffect, useMemo, useState } from 'react'
import { analyzePuyoSequence, createPuyoSequence, getFirstTwoPairColorCount, getSequenceColorCounts, SEQUENCE_PAIRS, type PuyoSequenceDebugState } from '../game/puyo-sequence'
import { generateReferencePuyoSequence } from '../game/puyo-sequence-reference'
import type { Pair, PuyoColor } from '../game/types'
import './puyo-sequence-debug.css'

const COLORS: PuyoColor[] = [1, 2, 3, 4]
const COLOR_NAMES: Record<PuyoColor, string> = { 1: '赤', 2: '青', 3: '緑', 4: '紫' }
const COLOR_MARKS: Record<PuyoColor, string> = { 1: '🔴', 2: '🔵', 3: '🟢', 4: '🟣' }
const DEBUG_HOTKEY = 'Ctrl + Shift + F12'

function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0
}

function PairView({ pair }: { pair: Pair }) {
  return <span className="sequence-pair"><b>{COLOR_MARKS[pair.axis]}</b><b>{COLOR_MARKS[pair.child]}</b></span>
}

export function PuyoSequenceDebugPanel() {
  const [open, setOpen] = useState(false)
  const [seedInput, setSeedInput] = useState('')
  const [state, setState] = useState<PuyoSequenceDebugState>(() => createPuyoSequence())

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey && event.code === 'F12') {
        event.preventDefault()
        event.stopImmediatePropagation()
        setOpen((value) => !value)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const counts = useMemo(() => getSequenceColorCounts(state.sequence), [state.sequence])
  const firstTwoColors = useMemo(() => getFirstTwoPairColorCount(state.sequence), [state.sequence])
  const analysis = useMemo(() => analyzePuyoSequence(state.sequence), [state.sequence])
  const referenceSequence = useMemo(() => generateReferencePuyoSequence(state.seed), [state.seed])
  const referenceAnalysis = useMemo(() => analyzePuyoSequence(referenceSequence), [referenceSequence])
  const referenceCounts = referenceAnalysis.colorCounts

  const regenerate = (seed: number) => {
    const next = createPuyoSequence(seed)
    setState(next)
    setSeedInput(String(next.seed))
  }

  if (!open) return null

  return <aside className="puyo-sequence-debug" aria-label="配ぷよ検証モード">
    <div className="puyo-sequence-debug-header">
      <div><span className="debug-eyebrow">DEVELOPMENT</span><strong>配ぷよ検証モード</strong></div>
      <button onClick={() => setOpen(false)} aria-label="閉じる">×</button>
    </div>

    <div className="debug-controls">
      <label>Seed<input value={seedInput || String(state.seed)} onChange={(event) => setSeedInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') regenerate(Number(seedInput) || randomSeed()) }} /></label>
      <button onClick={() => regenerate(randomSeed())}>再生成</button>
      <button onClick={() => { void navigator.clipboard?.writeText(String(state.seed)) }}>Seedコピー</button>
    </div>

    <div className="debug-summary">
      <div><span>周期</span><b>{SEQUENCE_PAIRS}手</b></div>
      <div><span>初手2手</span><b className={firstTwoColors <= 3 ? 'debug-ok' : 'debug-ng'}>{firstTwoColors}色 {firstTwoColors <= 3 ? '✓' : '✕'}</b></div>
      <div><span>現在位置</span><b>{state.index}/{SEQUENCE_PAIRS}</b></div>
    </div>

    <div className="debug-counts">
      {COLORS.map((color) => <span key={color}>{COLOR_MARKS[color]} {COLOR_NAMES[color]} <b>{counts[color]}</b></span>)}
    </div>

    <div className="debug-analysis">
      <div className="debug-analysis-title">短期偏りチェック</div>
      <div className="debug-analysis-grid">
        <span>同色ツモ</span><b>{analysis.pairSameColorCount}/128</b>
        <span>隣接同色</span><b>{analysis.adjacentSameColorCount}/255</b>
        <span>8個窓 最大差</span><b>{analysis.windowSpread[8]}</b>
        <span>16個窓 最大差</span><b>{analysis.windowSpread[16]}</b>
        <span>32個窓 最大差</span><b>{analysis.windowSpread[32]}</b>
        <span>64個窓 最大差</span><b>{analysis.windowSpread[64]}</b>
      </div>
      <small>窓内の色数の最大−最小。値が大きいほど局所的な偏りが強い。</small>
    </div>

    <div className="debug-analysis">
      <div className="debug-analysis-title">参考モデルとの比較</div>
      <div className="debug-analysis-grid">
        <span>モデル</span><b>現行 / 参考</b>
        <span>赤</span><b>{counts[1]} / {referenceCounts[1]}</b>
        <span>青</span><b>{counts[2]} / {referenceCounts[2]}</b>
        <span>緑</span><b>{counts[3]} / {referenceCounts[3]}</b>
        <span>紫</span><b>{counts[4]} / {referenceCounts[4]}</b>
        <span>初手2手の色数</span><b>{firstTwoColors} / {referenceAnalysis.firstTwoColorCount}</b>
        <span>同色ツモ</span><b>{analysis.pairSameColorCount} / {referenceAnalysis.pairSameColorCount}</b>
        <span>隣接同色</span><b>{analysis.adjacentSameColorCount} / {referenceAnalysis.adjacentSameColorCount}</b>
        <span>8個窓 最大差</span><b>{analysis.windowSpread[8]} / {referenceAnalysis.windowSpread[8]}</b>
        <span>16個窓 最大差</span><b>{analysis.windowSpread[16]} / {referenceAnalysis.windowSpread[16]}</b>
      </div>
      <small>参考モデルは公開情報を構造化した開発用モデルで、実機の完全再現ではありません。</small>
    </div>

    <div className="debug-sequence-grid">
      {state.sequence.map((pair, index) => <div className={`sequence-row ${index < 2 ? 'sequence-first' : ''}`} key={index}>
        <span>{String(index + 1).padStart(3, '0')}</span><PairView pair={pair} />
      </div>)}
    </div>
    <div className="debug-hint">{DEBUG_HOTKEY} で表示 / 非表示</div>
  </aside>
}
