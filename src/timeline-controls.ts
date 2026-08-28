const CONTROL_ID = 'puyo-timeline-enhancements'
const STYLE_ID = 'puyo-timeline-enhancements-style'
const PINS_STORAGE_KEY = 'puyo-trainer-timeline-pins'
const HINT_ID = 'puyo-timeline-pin-hint'

interface TimelinePin { time: number; comment?: string }

let installed = false
let openCommentEditor: (() => void) | null = null

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function readPins(): TimelinePin[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PINS_STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.map((value): TimelinePin | null => {
      if (typeof value === 'number' && Number.isFinite(value)) return { time: value }
      if (!value || typeof value !== 'object') return null
      const time = Number((value as { time?: unknown }).time)
      if (!Number.isFinite(time)) return null
      const comment = (value as { comment?: unknown }).comment
      return { time, ...(typeof comment === 'string' && comment ? { comment } : {}) }
    }).filter((value): value is TimelinePin => value !== null).sort((a, b) => a.time - b.time)
  } catch {
    return []
  }
}

function writePins(pins: TimelinePin[]): void {
  const normalized = [...pins].sort((a, b) => a.time - b.time)
  localStorage.setItem(PINS_STORAGE_KEY, JSON.stringify(normalized))
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
    #${CONTROL_ID}{position:absolute;inset:0;pointer-events:none;z-index:2}
    #${CONTROL_ID} .timeline-pin{position:absolute;top:50%;width:3px;height:18px;transform:translate(-50%,-50%);border:0;border-radius:3px;padding:0;background:#f3c45b;box-shadow:0 0 0 1px rgba(0,0,0,.35),0 0 8px rgba(243,196,91,.45);pointer-events:auto;cursor:pointer}
    #${CONTROL_ID} .timeline-pin::after{content:'';position:absolute;left:50%;top:-4px;width:9px;height:9px;transform:translateX(-50%);border-radius:50%;background:#f3c45b;box-shadow:0 1px 4px rgba(0,0,0,.4)}
    #${CONTROL_ID} .timeline-pin:hover{height:22px;filter:brightness(1.08)}
    #${CONTROL_ID} .timeline-pin-label{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);padding:3px 5px;border-radius:4px;background:rgba(12,15,20,.94);border:1px solid #3b4658;color:#e8edf5;font-size:9px;line-height:1.25;white-space:nowrap;max-width:240px;overflow:hidden;text-overflow:ellipsis;opacity:0;transition:opacity .12s ease;pointer-events:none}
    #${CONTROL_ID} .timeline-pin:hover .timeline-pin-label{opacity:1}
    #${CONTROL_ID} .pin-comment-editor{position:fixed;z-index:10000;width:260px;padding:10px;border-radius:7px;background:#121720;border:1px solid #3b4658;box-shadow:0 8px 28px rgba(0,0,0,.45);pointer-events:auto}
    #${CONTROL_ID} .pin-comment-time{font-size:11px;color:#aeb8c8;margin-bottom:6px}
    #${CONTROL_ID} .pin-comment-input{width:100%;min-height:64px;box-sizing:border-box;resize:vertical;padding:7px;border-radius:5px;border:1px solid #465266;background:#0b0f15;color:#edf2f8;font:inherit;font-size:12px;outline:none}
    #${CONTROL_ID} .pin-comment-input:focus{border-color:#6e8eb8}
    #${CONTROL_ID} .pin-comment-actions{display:flex;justify-content:flex-end;gap:6px;margin-top:7px}
    #${CONTROL_ID} .pin-comment-actions button{border:1px solid #465266;border-radius:4px;padding:4px 8px;background:#1c2430;color:#dfe7f1;cursor:pointer;font-size:11px}
    #${CONTROL_ID} .pin-comment-actions .pin-comment-save{background:#315d8f;border-color:#4677ae}
    #${CONTROL_ID} .pin-comment-actions .pin-comment-delete{margin-right:auto;color:#ff9a9a}
    .timeline-wrap.pins-ready{position:relative}
    .timeline-wrap.pins-ready .timeline{position:relative;z-index:1}
    #${HINT_ID}{margin-left:8px;color:#8994a5}
  `
  document.head.appendChild(style)
}

function getTimeline(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>('.timeline[type="range"]')
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

function closeEditor(): void {
  const editor = document.querySelector<HTMLElement>(`#${CONTROL_ID} .pin-comment-editor`)
  editor?.remove()
  openCommentEditor = null
}

function openEditor(wrap: HTMLElement, timeline: HTMLInputElement, pin: TimelinePin, pinIndex: number, anchor: HTMLElement): void {
  closeEditor()
  const editor = document.createElement('div')
  editor.className = 'pin-comment-editor'
  const time = document.createElement('div')
  time.className = 'pin-comment-time'
  time.textContent = `ピン ${formatTime(pin.time)}`
  const input = document.createElement('textarea')
  input.className = 'pin-comment-input'
  input.placeholder = 'この場面へのコメント…'
  input.value = pin.comment ?? ''
  input.setAttribute('aria-label', 'ピンのコメント')

  const actions = document.createElement('div')
  actions.className = 'pin-comment-actions'
  const deleteButton = document.createElement('button')
  deleteButton.className = 'pin-comment-delete'
  deleteButton.type = 'button'
  deleteButton.textContent = 'ピンを削除'
  const cancelButton = document.createElement('button')
  cancelButton.type = 'button'
  cancelButton.textContent = 'キャンセル'
  const saveButton = document.createElement('button')
  saveButton.className = 'pin-comment-save'
  saveButton.type = 'button'
  saveButton.textContent = '保存'
  actions.append(deleteButton, cancelButton, saveButton)
  editor.append(time, input, actions)
  wrap.appendChild(editor)

  const rect = anchor.getBoundingClientRect()
  editor.style.left = `${Math.min(window.innerWidth - 270, Math.max(8, rect.left - 120))}px`
  editor.style.top = `${Math.min(window.innerHeight - 150, Math.max(8, rect.bottom + 8))}px`

  const save = () => {
    const pins = readPins()
    const target = pins.find((candidate) => Math.abs(candidate.time - pin.time) < 0.001)
    if (target) {
      const comment = input.value.trim()
      if (comment) target.comment = comment
      else delete target.comment
      writePins(pins)
      renderPins(wrap, timeline)
    }
    closeEditor()
  }

  saveButton.addEventListener('click', save)
  cancelButton.addEventListener('click', closeEditor)
  deleteButton.addEventListener('click', () => {
    const pins = readPins()
    pins.splice(pinIndex, 1)
    writePins(pins)
    closeEditor()
    renderPins(wrap, timeline)
  })
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); closeEditor() }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); save() }
  })
  input.focus()
  input.select()
  openCommentEditor = closeEditor
}

function renderPins(wrap: HTMLElement, timeline: HTMLInputElement): void {
  ensureStyle()
  closeEditor()
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

  const pins = readPins()
  pins.forEach((pin, pinIndex) => {
    if (pin.time < min || pin.time > max) return
    const pinButton = document.createElement('button')
    pinButton.type = 'button'
    pinButton.className = 'timeline-pin'
    pinButton.style.left = `${((pin.time - min) / (max - min)) * 100}%`
    pinButton.title = pin.comment ? `${formatTime(pin.time)} · ${pin.comment}` : `${formatTime(pin.time)} にジャンプ · Pで削除`
    pinButton.setAttribute('aria-label', pin.comment ? `${formatTime(pin.time)}: ${pin.comment}` : `${formatTime(pin.time)} のピン`)

    const label = document.createElement('span')
    label.className = 'timeline-pin-label'
    label.textContent = pin.comment ? `${formatTime(pin.time)} · ${pin.comment}` : formatTime(pin.time)
    pinButton.appendChild(label)

    pinButton.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      setTimelineValue(timeline, pin.time)
      openEditor(wrap, timeline, pin, pinIndex, pinButton)
    })
    layer!.appendChild(pinButton)
  })
}

function ensureHint(): void {
  const hint = document.querySelector<HTMLElement>('.replay-hint')
  if (!hint || document.getElementById(HINT_ID)) return
  const pinHint = document.createElement('span')
  pinHint.id = HINT_ID
  pinHint.textContent = 'P: ピン'
  hint.appendChild(pinHint)
}

function toggleCurrentPin(timeline: HTMLInputElement): void {
  const current = Number(timeline.value)
  const min = Number(timeline.min) || 0
  const max = Number(timeline.max) || 0
  if (max <= min) return
  const pins = readPins()
  const tolerance = Math.max(10, (max - min) * 0.0025)
  const existingIndex = pins.findIndex((pin) => Math.abs(pin.time - current) <= tolerance)
  if (existingIndex >= 0) pins.splice(existingIndex, 1)
  else pins.push({ time: current })
  writePins(pins)
  const wrap = timeline.closest<HTMLElement>('.timeline-wrap')
  if (wrap) renderPins(wrap, timeline)
}

function setupTimeline(): boolean {
  const timeline = getTimeline()
  const wrap = timeline?.closest<HTMLElement>('.timeline-wrap')
  if (!timeline || !wrap) return false
  ensureStyle()
  ensureHint()
  wrap.classList.add('pins-ready')
  renderPins(wrap, timeline)

  if (!wrap.dataset.timelineClickReady) {
    wrap.dataset.timelineClickReady = 'true'
    wrap.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.timeline-pin') || target?.closest('.pin-comment-editor')) return
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
  const target = event.target as HTMLElement | null
  if (target?.matches('input, textarea, select, button') && !target.matches('.timeline')) return
  const timeline = getTimeline()
  if (!timeline || timeline.disabled || Number(timeline.max) <= Number(timeline.min)) return
  event.preventDefault()
  event.stopImmediatePropagation()
  toggleCurrentPin(timeline)
})

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true })
else window.requestAnimationFrame(install)
