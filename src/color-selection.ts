type VisualColor = 1 | 2 | 3 | 4 | 5

const COLORS: VisualColor[] = [1, 2, 3, 5, 4]
const NAMES: Record<VisualColor, string> = { 1: '赤', 2: '青', 3: '緑', 4: '紫', 5: '黄' }
const HEX: Record<VisualColor, string> = { 1: '#ff5b68', 2: '#5aa7ff', 3: '#58d68d', 4: '#b66cff', 5: '#ffd45a' }
const STORAGE_KEY = 'puyo-trainer-active-colors-v1'
const EVENT = 'puyo-active-colors-changed'
const LEGACY_HEX: Record<1 | 2 | 3 | 4, string> = { 1: HEX[1], 2: HEX[2], 3: HEX[3], 4: HEX[4] }

function load(): VisualColor[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (Array.isArray(parsed)) {
      const values = parsed.filter((v): v is VisualColor => COLORS.includes(v)).filter((v, i, a) => a.indexOf(v) === i)
      if (values.length === 4) return values
    }
  } catch { /* ignore */ }
  return [1, 2, 3, 4]
}

function save(values: VisualColor[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(values))
  window.dispatchEvent(new Event(EVENT))
}

function mapping(): Record<1 | 2 | 3 | 4, VisualColor> {
  const active = load()
  return { 1: active[0], 2: active[1], 3: active[2], 4: active[3] }
}

function replaceTextNodes(root: HTMLElement, map: Record<1 | 2 | 3 | 4, VisualColor>): void {
  const legacyNames: Record<string, 1 | 2 | 3 | 4> = { '赤': 1, '青': 2, '緑': 3, '紫': 4 }
  root.querySelectorAll<HTMLElement>('.mini-puyo, .current-pair button, .context-color').forEach((el) => {
    const legacy = legacyNames[el.textContent?.trim() ?? '']
    if (legacy) el.textContent = NAMES[map[legacy]]
  })
  root.querySelectorAll<HTMLElement>('.pair-option small').forEach((el) => {
    const text = el.textContent ?? ''
    const m = text.match(/^(赤|青|緑|紫)×(赤|青|緑|紫)$/)
    if (!m) return
    const lookup = (name: string) => legacyNames[name]
    el.textContent = `${NAMES[map[lookup(m[1])]]}×${NAMES[map[lookup(m[2])]]}`
  })
}

function repaint(): void {
  const map = mapping()
  const hexMap = new Map<string, string>(Object.entries(LEGACY_HEX).map(([k, v]) => [v, HEX[map[Number(k) as 1 | 2 | 3 | 4]]]))
  document.querySelectorAll<HTMLElement>('.puyo, .mini-puyo, .context-dot, .current-pair button').forEach((el) => {
    const raw = el.style.backgroundColor || el.style.background
    const normalized = raw.replace(/\s/g, '').toLowerCase()
    for (const [legacy, next] of hexMap) {
      if (normalized === legacy.toLowerCase() || normalized === `rgb(${parseInt(legacy.slice(1,3),16)},${parseInt(legacy.slice(3,5),16)},${parseInt(legacy.slice(5,7),16)})`) {
        el.dataset.puyoLegacyColor = legacy
        el.style.background = next
        break
      }
    }
  })
  replaceTextNodes(document.body, map)
}

function installSettings(): void {
  const modal = document.querySelector<HTMLElement>('.keybind-modal')
  if (!modal || modal.querySelector('.color-selection-settings')) return
  const box = document.createElement('div')
  box.className = 'color-selection-settings'
  box.innerHTML = '<div class="color-selection-title">使用するぷよ色</div><div class="color-selection-help">5色の中から4色を選択。選択中の4色がハイライトされます。</div><div class="color-selection-grid"></div>'
  const grid = box.querySelector<HTMLElement>('.color-selection-grid')!
  const render = () => {
    const active = load()
    grid.innerHTML = ''
    COLORS.forEach((color) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `color-choice ${active.includes(color) ? 'selected' : ''}`
      button.style.setProperty('--choice-color', HEX[color])
      button.innerHTML = `<span class="color-choice-dot"></span><span>${NAMES[color]}</span><small>${active.includes(color) ? '使用' : '未使用'}</small>`
      button.addEventListener('click', () => {
        const current = load()
        if (current.includes(color)) return
        const next = [...current.slice(0, 3), color] as VisualColor[]
        save(next)
        render()
        repaint()
      })
      grid.appendChild(button)
    })
  }
  render()
  modal.querySelector('.keybind-focus-help')?.after(box)
}

const style = document.createElement('style')
style.textContent = `.color-selection-settings{margin-top:14px;padding:12px;border:1px solid #252d3a;background:#0d1118;border-radius:9px}.color-selection-title{color:#e5eaf1;font-size:11px;font-weight:800;margin-bottom:4px}.color-selection-help{color:#697588;font-size:9px;margin-bottom:9px}.color-selection-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}.color-choice{display:grid;grid-template-columns:16px 1fr;align-items:center;gap:4px;padding:7px 5px;background:#171c25;border:1px solid #303949;border-radius:7px;font-size:10px;text-align:left}.color-choice.selected{border-color:#8fd7ff;box-shadow:0 0 0 1px rgba(143,215,255,.18);background:#202735}.color-choice-dot{width:16px;height:16px;border-radius:50%;background:var(--choice-color);box-shadow:inset 0 1px 2px rgba(255,255,255,.3)}.color-choice small{grid-column:1/-1;color:#697588;font-size:8px}.color-choice.selected small{color:#8fd7ff}@media(max-width:640px){.color-selection-grid{grid-template-columns:repeat(2,1fr)}}`
document.head.appendChild(style)

const observer = new MutationObserver(() => { installSettings(); repaint() })
observer.observe(document.body, { childList: true, subtree: true })
window.addEventListener(EVENT, repaint)
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', repaint, { once: true })
else repaint()
