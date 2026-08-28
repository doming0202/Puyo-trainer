import type { TimelineBranchInfo } from './game/replay'

const TRACK_ID = 'puyo-timeline-original-track'
const STYLE_ID = 'puyo-timeline-original-track-style'
const RETURN_EVENT = 'puyo-timeline-return-original'

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .timeline-wrap.branch-view-ready{position:relative}
    #${TRACK_ID}{
      display:flex;
      align-items:center;
      gap:8px;
      min-height:16px;
      margin:0 2px 3px;
      color:#7f8998;
      font-size:9px;
      line-height:1;
      letter-spacing:.05em;
      user-select:none;
    }
    #${TRACK_ID} .branch-track-label{
      flex:0 0 auto;
      width:55px;
      font-weight:800;
      color:#a1abba;
    }
    #${TRACK_ID} .branch-track{
      position:relative;
      flex:1;
      height:4px;
      border-radius:999px;
      background:#202733;
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.035);
      pointer-events:none;
    }
    #${TRACK_ID} .branch-original-fill{
      position:absolute;
      left:0;
      top:0;
      height:100%;
      border-radius:inherit;
      background:#6c7686;
      opacity:.72;
    }
    #${TRACK_ID} .branch-fork{
      position:absolute;
      top:50%;
      width:7px;
      height:7px;
      transform:translate(-50%,-50%);
      border-radius:50%;
      background:#f3c45b;
      box-shadow:0 0 0 2px rgba(243,196,91,.14),0 0 7px rgba(243,196,91,.38);
    }
    #${TRACK_ID} .branch-track-caption{
      flex:0 0 auto;
      min-width:76px;
      text-align:right;
      color:#687384;
      font-variant-numeric:tabular-nums;
    }
    #${TRACK_ID} .branch-return{
      flex:0 0 auto;
      border:1px solid #344153;
      border-radius:6px;
      padding:4px 7px;
      background:#171d26;
      color:#bdc7d4;
      font:700 9px/1 inherit;
      cursor:pointer;
      pointer-events:auto;
      white-space:nowrap;
    }
    #${TRACK_ID} .branch-return:hover{
      border-color:#5b6f88;
      color:#f0f4f9;
      background:#1c2430;
    }
    .timeline-wrap.branch-view-ready .timeline-labels{margin-top:2px}
  `
  document.head.appendChild(style)
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, ms) / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = (totalSeconds % 60).toFixed(1).padStart(4, '0')
  return `${minutes}:${seconds}`
}

function getTimeline(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>('.timeline[type="range"]')
}

function render(info: TimelineBranchInfo, timeline: HTMLInputElement, wrap: HTMLElement): void {
  ensureStyle()
  let host = document.getElementById(TRACK_ID)
  if (!host) {
    host = document.createElement('div')
    host.id = TRACK_ID
    host.innerHTML = '<span class="branch-track-label">ORIGINAL</span><span class="branch-track"><span class="branch-original-fill"></span><span class="branch-fork"></span></span><span class="branch-track-caption"></span><button type="button" class="branch-return">Originalへ戻る</button>'
    const labels = wrap.querySelector('.timeline-labels')
    wrap.insertBefore(host, labels ?? timeline)

    host.querySelector<HTMLButtonElement>('.branch-return')?.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      window.dispatchEvent(new Event(RETURN_EVENT))
    })
  }

  const currentMax = Math.max(1, Number(timeline.max) || 1)
  const originalDuration = Math.max(0, info.originalDurationMs)
  const forkTime = Math.max(0, Math.min(originalDuration, info.forkElapsedMs))
  const originalRatio = Math.min(1, originalDuration / currentMax)
  const forkRatio = Math.min(1, forkTime / currentMax)

  const fill = host.querySelector<HTMLElement>('.branch-original-fill')
  const fork = host.querySelector<HTMLElement>('.branch-fork')
  const caption = host.querySelector<HTMLElement>('.branch-track-caption')
  if (fill) fill.style.width = `${originalRatio * 100}%`
  if (fork) {
    fork.style.left = `${forkRatio * 100}%`
    fork.title = `分岐点 ${formatTime(forkTime)}`
  }
  if (caption) caption.textContent = `分岐 ${formatTime(forkTime)}`
  wrap.classList.add('branch-view-ready')
}

function clear(): void {
  document.getElementById(TRACK_ID)?.remove()
  document.querySelectorAll<HTMLElement>('.timeline-wrap.branch-view-ready').forEach((wrap) => wrap.classList.remove('branch-view-ready'))
}

function mount(): boolean {
  const timeline = getTimeline()
  const wrap = timeline?.closest<HTMLElement>('.timeline-wrap')
  const info = window.__puyoTimelineBranch
  if (!timeline || !wrap || !info) return false
  render(info, timeline, wrap)
  return true
}

function install(): void {
  ensureStyle()
  mount()

  window.addEventListener('puyo-timeline-branch', (event) => {
    const info = (event as CustomEvent<TimelineBranchInfo>).detail
    const timeline = getTimeline()
    const wrap = timeline?.closest<HTMLElement>('.timeline-wrap')
    if (timeline && wrap && info) render(info, timeline, wrap)
  })

  window.addEventListener('puyo-timeline-branch-cleared', clear)

  const observer = new MutationObserver(() => {
    if (mount()) observer.disconnect()
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install, { once: true })
} else {
  window.requestAnimationFrame(install)
}
