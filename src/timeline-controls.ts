const CONTROL_ID = 'puyo-timeline-enhancements'
const STYLE_ID = 'puyo-timeline-enhancements-style'
const PINS_STORAGE_KEY = 'puyo-trainer-timeline-pins'

let installed = false

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function readPins(): number[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PINS_STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b)
  } catch {
    return []
  }
}

function writePins(pins: number[]): void {
  localStorage.setItem(PINS_STORAGE_KEY, JSON.stringify([...new Set(pins)].sort((a, b) => a - b)))
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, ms) / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = (totalSeconds % 60).toFixed(1).padStart(4, '0')
  return `${minutes}:${seconds}`
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #${CONTROL_ID}{
      position:absolute;
      inset:0;
      pointer-events:none;
      z-index:2;
    }
    #${CONTROL_ID} .timeline-pin{
      position:absolute;
      top:50%;
      width:3px;
      height:18px;
      transform:translate(-50%,-50%);
      border:0;
      border-radius:3px;
      padding:0;
      background:#f3c45b;
      box-shadow:0 0 0 1px rgba(0,0,0,.35),0 0 8px rgba(243,196,91,.45);
      pointer-events:auto;
      cursor:pointer;
    }
    #${CONTROL_ID} .timeline-pin::after{
      content:'';
      position:absolute;
      left:50%;
      top:-4px;
      width:9px;
      height:9px;
      transform:translateX(-50%);
      border-radius:50%;
      background:#f3c45b;
      box-shadow:0 1px 4px rgba(0,0,0,.4);
    }
    #${CONTROL_ID} .timeline-pin:hover{
      height:22px;
      filter:brightness(1.08);
    }
    #${CONTROL_ID} .timeline-pin-label{
      position:absolute;
      left:50%;
      bottom:22px;
      transform:translateX(-50%);
      padding:3px 5px;
      border-radius:4px;
      background:rgba(12,15,20,.94);
      border:1px solid #3b4658;
      color:#e8edf5;
      font-size:9px;
      line-height:1;
      white-space:nowrap;
      opacity:0;
      transition:opacity .12s ease;
      pointer-events:none;
    }
    #${CONTROL_ID} .timeline-pin:hover .timeline-pin-label{opacity:1}
    .timeline-wrap.pins-ready{position:relative}
    .timeline-wrap.pins-ready .timeline{position:relative;z-index:1}
  `
  document.head.appendChild(style)
}

function getTimeline(): HTMLInputElement | null {
  const timeline = document.querySelector<HTMLInputElement>('.timeline[type="range"]')
  return timeline
}

function setTimelineValue(timeline: HTMLInputElement, value: number): void {
  const min = Number(timeline.min) || 0
  const max = Number(timeline.max) || 0
  const next = clamp(value, min, max)

  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(timeline, String(next))

  timeline.dispatchEvent(new Event('input', { bubbles: true }))
  timeline.dispatchEvent(new Event('change', { bubbles: true }))
}

function jumpFromPointer(timeline: HTMLInputElement, clientX: number): void {
  const rect = timeline.getBoundingClientRect()
  if (rect.width <= 0) return

  const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
  const min = Number(timeline.min) || 0
  const max = Number(timeline.max) || 0
  setTimelineValue(timeline, min + (max - min) * ratio)
}

function renderPins(wrap: HTMLElement, timeline: HTMLInputElement): void {
  ensureStyle()
  let layer = wrap.querySelector<HTMLElement>(`#${CONTROL_ID}`)
  if (!layer) {
    layer = document.createElement('div')
    layer.id = CONTROL_ID
    wrap.appendChild(layer)
  }

  layer.innerHTML = ''

  const min = Number(timeline.min) || 0
  const max = Number(timeline.max) || 0
  if (max <= min) return

  for (const pinTime of readPins()) {
    if (pinTime < min || pinTime > max) continue

    const pin = document.createElement('button')
    pin.type = 'button'
    pin.className = 'timeline-pin'
    pin.style.left = `${((pinTime - min) / (max - min)) * 100}%`
    pin.title = `${formatTime(pinTime)} にジャンプ · Pで削除`
    pin.setAttribute('aria-label', `${formatTime(pinTime)} のピン`)

    const label = document.createElement('span')
    label.className = 'timeline-pin-label'
    label.textContent = formatTime(pinTime)
    pin.appendChild(label)

    pin.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      setTimelineValue(timeline, pinTime)
    })

    layer.appendChild(pin)
  }
}

function toggleCurrentPin(timeline: HTMLInputElement): void {
  const current = Number(timeline.value)
  const min = Number(timeline.min) || 0
  const max = Number(timeline.max) || 0
  if (max <= min) return

  const pins = readPins()
  const tolerance = Math.max(10, (max - min) * 0.0025)
  const existingIndex = pins.findIndex((pin) => Math.abs(pin - current) <= tolerance)

  if (existingIndex >= 0) {
    pins.splice(existingIndex, 1)
  } else {
    pins.push(current)
  }

  writePins(pins)
  const wrap = timeline.closest<HTMLElement>('.timeline-wrap')
  if (wrap) renderPins(wrap, timeline)
}

function setupTimeline(): boolean {
  const timeline = getTimeline()
  const wrap = timeline?.closest<HTMLElement>('.timeline-wrap')
  if (!timeline || !wrap) return false

  ensureStyle()
  wrap.classList.add('pins-ready')
  renderPins(wrap, timeline)

  if (!wrap.dataset.timelineClickReady) {
    wrap.dataset.timelineClickReady = 'true'
    wrap.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.timeline-pin')) return
      if (target !== timeline && !target?.closest('.timeline')) return
      jumpFromPointer(timeline, (event as MouseEvent).clientX)
    })
  }

  if (!timeline.dataset.timelinePinsReady) {
    timeline.dataset.timelinePinsReady = 'true'
    timeline.addEventListener('input', () => renderPins(wrap, timeline))
  }

  return true
}

function install(): void {
  if (installed) return
  installed = setupTimeline()
  if (installed) return

  const observer = new MutationObserver(() => {
    if (setupTimeline()) observer.disconnect()
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

window.addEventListener('keydown', (event) => {
  if (event.repeat || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return
  if (event.key.toLowerCase() !== 'p') return
  if ((event.target as HTMLElement | null)?.matches('input, textarea, select, button')) return

  const timeline = getTimeline()
  if (!timeline || timeline.disabled || Number(timeline.max) <= Number(timeline.min)) return

  event.preventDefault()
  toggleCurrentPin(timeline)
})

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install, { once: true })
} else {
  window.requestAnimationFrame(install)
}
