const SETTINGS_SELECTOR = '.settings-button'

function normalizeSettingsButtons(): void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(SETTINGS_SELECTOR))
  if (buttons.length === 0) return

  const keep = buttons[buttons.length - 1]

  // React can trigger this observer again when we modify the button.
  // Once the button has been normalized, there is nothing left to do.
  if (buttons.length === 1 && keep.dataset.settingsIconReady === '1') return

  buttons.slice(0, -1).forEach((button) => button.remove())

  if (keep.textContent !== '🔖') keep.textContent = '🔖'
  if (keep.dataset.settingsIconReady !== '1') keep.dataset.settingsIconReady = '1'
  if (keep.title !== 'キーバインド設定') keep.title = 'キーバインド設定'
  if (keep.getAttribute('aria-label') !== 'キーバインド設定') keep.setAttribute('aria-label', 'キーバインド設定')
  if (keep.style.width !== '38px') keep.style.width = '38px'
  if (keep.style.height !== '38px') keep.style.height = '38px'
  if (keep.style.padding !== '0px') keep.style.padding = '0'
  if (keep.style.display !== 'inline-grid') keep.style.display = 'inline-grid'
  if (keep.style.placeItems !== 'center') keep.style.placeItems = 'center'
}

function install(): void {
  normalizeSettingsButtons()

  const observer = new MutationObserver(() => normalizeSettingsButtons())
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install, { once: true })
} else {
  install()
}
