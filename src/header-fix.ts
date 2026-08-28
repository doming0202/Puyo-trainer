const HEADER_SETTINGS_SELECTOR = '.header-actions > .settings-button'
const SNAPSHOT_PANEL_SELECTOR = '.snapshot-panel'
const SNAPSHOT_SETTINGS_ID = 'snapshot-settings-button'

function installSnapshotSettingsButton(): void {
  const headerButton = document.querySelector<HTMLButtonElement>(HEADER_SETTINGS_SELECTOR)
  const snapshotPanel = document.querySelector<HTMLElement>(SNAPSHOT_PANEL_SELECTOR)
  if (!headerButton || !snapshotPanel) return

  let snapshotButton = document.getElementById(SNAPSHOT_SETTINGS_ID) as HTMLButtonElement | null
  if (!snapshotButton) {
    snapshotButton = document.createElement('button')
    snapshotButton.id = SNAPSHOT_SETTINGS_ID
    snapshotButton.type = 'button'
    snapshotPanel.appendChild(snapshotButton)
  }

  snapshotButton.textContent = '🔖'
  snapshotButton.title = 'キーバインド設定'
  snapshotButton.setAttribute('aria-label', 'キーバインド設定')
  snapshotButton.className = 'settings-button snapshot-settings-button'
  snapshotButton.onclick = () => headerButton.click()
}

function removeInjectedHeaderButton(): void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.header-actions > .settings-button'))
  if (buttons.length > 1) {
    buttons.slice(1).forEach((button) => button.remove())
  }
}

function install(): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      removeInjectedHeaderButton()
      installSnapshotSettingsButton()
    })
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install, { once: true })
} else {
  install()
}
