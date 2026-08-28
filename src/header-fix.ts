const SETTINGS_SELECTOR = '.settings-button'

const SETTINGS_SVG = `
<svg class="settings-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1a7.2 7.2 0 0 0-1.7-.98L14.5 2.42A.49.49 0 0 0 14 2h-4a.49.49 0 0 0-.49.42L9.13 5.07c-.61.25-1.18.58-1.7.98l-2.49-1a.5.5 0 0 0-.61.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65c-.04.32-.08.65-.08.98s.03.66.08.98l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46c.12.21.37.3.61.22l2.49-1c.52.4 1.09.73 1.7.98l.38 2.65c.04.24.24.42.49.42h4c.25 0 .46-.18.5-.42l.38-2.65c.61-.25 1.18-.58 1.7-.98l2.49 1c.24.08.49-.01.61-.22l2-3.46a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z" fill="currentColor"/>
</svg>`

function normalizeSettingsButtons(): void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(SETTINGS_SELECTOR))
  if (buttons.length === 0) return

  const keep = buttons[buttons.length - 1]
  buttons.slice(0, -1).forEach((button) => button.remove())

  if (keep.dataset.settingsIconReady !== '1') {
    keep.textContent = ''
    keep.insertAdjacentHTML('afterbegin', SETTINGS_SVG)
    keep.dataset.settingsIconReady = '1'
    keep.title = 'キーバインド設定'
    keep.setAttribute('aria-label', 'キーバインド設定')
    keep.style.width = '38px'
    keep.style.height = '38px'
    keep.style.padding = '0'
    keep.style.display = 'inline-grid'
    keep.style.placeItems = 'center'
  }
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
