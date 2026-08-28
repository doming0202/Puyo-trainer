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

function install(): void {
  normalizeSettingsButtons()

  const observer = new MutationObserver(() => normalizeSettingsButtons())
  observer.observe(document.body, { childList: true, subtree: true })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install, { once: true })
} else {
  install()
}
