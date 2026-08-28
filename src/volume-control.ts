import { getMasterVolume, setMasterVolume } from './game/sound'

const CONTROL_ID = 'puyo-volume-control'
const STYLE_ID = 'puyo-volume-control-style'

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #${CONTROL_ID}{
      display:flex;align-items:center;gap:8px;
      padding:6px 9px;
      border:1px solid #2c3442;
      border-radius:8px;
      background:rgba(18,22,30,.72);
      color:#9aa5b6;
      font-size:10px;
      white-space:nowrap;
    }
    #${CONTROL_ID} .volume-icon{font-size:12px;line-height:1}
    #${CONTROL_ID} .volume-label{font-weight:800;letter-spacing:.04em}
    #${CONTROL_ID} .volume-slider{
      width:110px;
      height:18px;
      margin:0;
      appearance:none;
      -webkit-appearance:none;
      background:transparent;
      accent-color:#8fd7ff;
      cursor:pointer;
    }
    #${CONTROL_ID} .volume-slider::-webkit-slider-runnable-track{
      height:5px;border-radius:999px;background:#2a3240;
    }
    #${CONTROL_ID} .volume-slider::-webkit-slider-thumb{
      -webkit-appearance:none;
      width:14px;height:14px;margin-top:-4.5px;
      border:2px solid #0d1118;border-radius:50%;
      background:#8fd7ff;
      box-shadow:0 0 0 2px rgba(143,215,255,.18),0 2px 5px rgba(0,0,0,.35);
    }
    #${CONTROL_ID} .volume-slider::-moz-range-track{
      height:5px;border-radius:999px;background:#2a3240;
    }
    #${CONTROL_ID} .volume-slider::-moz-range-thumb{
      width:12px;height:12px;
      border:2px solid #0d1118;border-radius:50%;
      background:#8fd7ff;
    }
    #${CONTROL_ID} .volume-value{min-width:31px;text-align:right;font-variant-numeric:tabular-nums;color:#c6cfdb}
    @media (max-width: 760px){
      #${CONTROL_ID} .volume-slider{width:84px}
    }
  `
  document.head.appendChild(style)
}

function mount(): void {
  if (document.getElementById(CONTROL_ID)) return

  const host = document.querySelector<HTMLElement>('.header-actions')
  if (!host) return

  ensureStyle()

  const control = document.createElement('div')
  control.id = CONTROL_ID
  control.setAttribute('aria-label', 'ゲーム音量')

  const icon = document.createElement('span')
  icon.className = 'volume-icon'
  icon.textContent = '🔊'

  const label = document.createElement('span')
  label.className = 'volume-label'
  label.textContent = '音量'

  const slider = document.createElement('input')
  slider.className = 'volume-slider'
  slider.type = 'range'
  slider.min = '0'
  slider.max = '100'
  slider.step = '1'
  slider.value = String(Math.round(getMasterVolume() * 100))
  slider.setAttribute('aria-label', 'ゲーム音量')

  const value = document.createElement('span')
  value.className = 'volume-value'

  const updateDisplay = () => {
    const percent = Number(slider.value)
    value.textContent = `${percent}%`
    icon.textContent = percent === 0 ? '🔇' : percent < 50 ? '🔉' : '🔊'
  }

  slider.addEventListener('input', () => {
    setMasterVolume(Number(slider.value) / 100)
    updateDisplay()
  })

  updateDisplay()
  control.append(icon, label, slider, value)
  host.insertBefore(control, host.firstChild)
}

function install(): void {
  mount()
  if (document.getElementById(CONTROL_ID)) return

  const observer = new MutationObserver(() => {
    mount()
    if (document.getElementById(CONTROL_ID)) observer.disconnect()
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install, { once: true })
} else {
  window.requestAnimationFrame(install)
}
