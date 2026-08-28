const EVENT_NAME = 'puyo-timeline-seek-complete'

let installed = false

function getTimeline(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>('.timeline[type="range"]')
}

function notifySeekComplete(): void {
  window.dispatchEvent(new Event(EVENT_NAME))
}

function setup(): boolean {
  const timeline = getTimeline()
  if (!timeline) return false

  if (timeline.dataset.resumeReady !== 'true') {
    timeline.dataset.resumeReady = 'true'
    // React's onChange and timeline-controls' native handling both use the
    // timeline change event. This side-channel simply tells the pause layer
    // that a seek occurred and a gameplay key should be awaited.
    timeline.addEventListener('change', notifySeekComplete)
  }

  return true
}

function install(): void {
  if (installed || setup()) {
    installed = true
    return
  }

  const observer = new MutationObserver(() => {
    if (setup()) {
      installed = true
      observer.disconnect()
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install, { once: true })
} else {
  window.requestAnimationFrame(install)
}
