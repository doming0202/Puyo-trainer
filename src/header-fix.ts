const HEADER_SETTINGS_SELECTOR = '.header-actions > .settings-button'
const SNAPSHOT_SETTINGS_ID = 'snapshot-settings-button'

function installSnapshotSettingsButton(): void {
  const headerButton = document.querySelector<HTMLButtonElement>(HEADER_SETTINGS_SELECTOR)
  const snapshotPanel = document.querySelector<HTMLElement>('.snapshot-panel')
  if (!headerButton || !snapshotPanel) return

  let snapshotButton = document.getElementById(SNAPSHOT_SETTINGS_ID) as HTMLButtonElement | null
  if (!snapshotButton) {
    snapshotButton = document.createElement('button')
    snapshotButton.id = SNAPSHOT_SETTINGS_ID
    snapshotButton.className = 'settings-button snapshot-settings-button'
    snapshotButton.type = 'button'
    snapshotPanel.appendChild(snapshotButton)
  } else if (snapshotButton.parentElement !== snapshotPanel) {
    snapshotPanel.appendChild(snapshotButton)
  }

  snapshotButton.textContent = '🔖'
  snapshotButton.title = 'キーバインド設定'
  snapshotButton.setAttribute('aria-label', 'キーバインド設定')
  snapshotButton.style.width = '38px'
  snapshotButton.style.height = '38px'
  snapshotButton.style.padding = '0'
  snapshotButton.style.display = 'inline-grid'
  snapshotButton.style.placeItems = 'center'
  snapshotButton.style.flex = '0 0 38px'
  snapshotButton.onclick = () => {
    document.querySelector<HTMLButtonElement>(HEADER_SETTINGS_SELECTOR)?.click()
  }
}

function install(): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(installSnapshotSettingsButton)
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install, { once: true })
} else {
  install()
}
