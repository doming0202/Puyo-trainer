const SETTINGS_SELECTOR = '.settings-button'

function normalizeSettingsButton(): void {
  const button = document.querySelector<HTMLButtonElement>(SETTINGS_SELECTOR)
  const snapshotPanel = document.querySelector<HTMLElement>('.snapshot-panel')
  if (!button || !snapshotPanel) return

  // Reactが管理するボタンを一度だけSNAPSHOTパネルへ移動する。
  // MutationObserverは使用しない。React更新との無限ループを防ぐため。
  if (button.parentElement !== snapshotPanel) {
    snapshotPanel.appendChild(button)
  }

  button.textContent = '🔖'
  button.dataset.settingsIconReady = '1'
  button.title = 'キーバインド設定'
  button.setAttribute('aria-label', 'キーバインド設定')
  button.style.width = '38px'
  button.style.height = '38px'
  button.style.padding = '0'
  button.style.display = 'inline-grid'
  button.style.placeItems = 'center'
  button.style.flex = '0 0 38px'
}

// Reactの初期描画が完了してから一度だけ配置を整える。
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
