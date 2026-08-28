const HEADER_SETTINGS_SELECTOR = '.header-actions > .settings-button'
const SNAPSHOT_PANEL_SELECTOR = '.snapshot-panel'
const SNAPSHOT_SETTINGS_ID = 'snapshot-settings-button'
const SNAPSHOT_LIBRARY_SELECTOR = '.header-actions > button'

function findSnapshotLibraryButton(): HTMLButtonElement | null {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>(SNAPSHOT_LIBRARY_SELECTOR),
  ).find((button) => button.textContent?.includes('局面ライブラリ')) ?? null
}

function installSnapshotSettingsButton(): void {
  const headerSettingsButton = document.querySelector<HTMLButtonElement>(HEADER_SETTINGS_SELECTOR)
  const snapshotLibraryButton = findSnapshotLibraryButton()
  const snapshotPanel = document.querySelector<HTMLElement>(SNAPSHOT_PANEL_SELECTOR)

  if (!headerSettingsButton || !snapshotLibraryButton || !snapshotPanel) return

  // The header library button is the second gear shown by styles.css.
  // Keep the actual React keybind settings button untouched, but hide the
  // library trigger from the header because its action now lives in SNAPSHOT.
  snapshotLibraryButton.style.display = 'none'

  let snapshotButton = document.getElementById(
    SNAPSHOT_SETTINGS_ID,
  ) as HTMLButtonElement | null

  if (!snapshotButton) {
    snapshotButton = document.createElement('button')
    snapshotButton.id = SNAPSHOT_SETTINGS_ID
    snapshotButton.type = 'button'
    snapshotPanel.appendChild(snapshotButton)
  }

  snapshotButton.className = 'settings-button snapshot-settings-button'
  snapshotButton.textContent = '🔖'
  snapshotButton.title = '局面ライブラリ'
  snapshotButton.setAttribute('aria-label', '局面ライブラリ')
  snapshotButton.onclick = () => snapshotLibraryButton.click()

  // The header keybind settings button remains exactly where React placed it.
  headerSettingsButton.style.display = ''
}

function install(): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      installSnapshotSettingsButton()
    })
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install, { once: true })
} else {
  install()
}
