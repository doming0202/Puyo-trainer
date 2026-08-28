const SETTINGS_SELECTOR = '.settings-button'

function normalizeSettingsButtons(): void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(SETTINGS_SELECTOR))
  if (buttons.length === 0) return

  const keep = buttons[buttons.length - 1]
  buttons.slice(0, -1).forEach((button) => button.remove())

  keep.textContent = '🔖'
  keep.dataset.settingsIconReady = '1'
  keep.title = 'キーバインド設定'
  keep.setAttribute('aria-label', 'キーバインド設定')
  keep.style.width = '38px'
  keep.style.height = '38px'
  keep.style.padding = '0'
  keep.style.display = 'inline-grid'
  keep.style.placeItems = 'center'
}

// React のDOM更新を監視し続ける必要はない。
// MutationObserverを使うと、Reactの更新とDOM修正が相互に発火して
// 起動時に無限ループするため、起動後に一度だけ正規化する。
function install(): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      normalizeSettingsButtons()
    })
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install, { once: true })
} else {
  install()
}
