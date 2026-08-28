const SETTINGS_SELECTOR = '.settings-button'
const SNAPSHOT_SETTINGS_ID = 'snapshot-settings-button'

function normalizeSettingsButton(): void {
  const headerButton = document.querySelector<HTMLButtonElement>(SETTINGS_SELECTOR)
  const snapshotPanel = document.querySelector<HTMLElement>('.snapshot-panel')
  if (!headerButton || !snapshotPanel) return

  // Reactが管理するヘッダー側の⚙️ボタンは移動・変更しない。
  // SNAPSHOT側には独立した🔖ボタンを作り、クリック時に元のReactボタンを実行する。
  let snapshotButton = document.getElementById(SNAPSHOT_SETTINGS_ID) as HTMLButtonElement | null

  if (!snapshotButton) {
    snapshotButton = document.createElement('button')
    snapshotButton.id = SNAPSHOT_SETTINGS_ID
    snapshotButton.className = 'settings-button snapshot-settings-button'
    snapshotPanel.appendChild(snapshotButton)
  } else if (snapshotButton.parentElement !== snapshotPanel) {
    snapshotPanel.appendChild(snapshotButton)
  }

  snapshotButton.textContent = '🔖'
  snapshotButton.title = 'キーバインド設定'
  snapshotButton.setAttribute('aria-label', 'キーバインド設定')
  snapshotButton.type = 'button'
  snapshotButton.style.width = '38px'
  snapshotButton.style.height = '38px'
  snapshotButton.style.padding = '0'
  snapshotButton.style.display = 'inline-grid'
  snapshotButton.style.placeItems = 'center'
  snapshotButton.style.flex = '0 0 38px'
  snapshotButton.onclick = () => headerButton.click()
}

// Reactの初期描画が完了してから一度だけ配置を整える。
// MutationObserverは使用しない。React更新との無限ループを防ぐため。
function install(): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      normalizeSettingsButton()
    })
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install, { once: true })
} else {
  install()
}
