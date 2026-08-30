export type RoomAccessRole = 'coach' | 'student' | null

let role: RoomAccessRole = null

export function setRoomAccessRole(nextRole: RoomAccessRole): void {
  role = nextRole
}

export function getRoomAccessRole(): RoomAccessRole {
  return role
}

function isStudent(): boolean {
  return role === 'student'
}

function blockedElement(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null
  return target.closest('.title-reset-button, .replay-controls, .timeline[type="range"]')
}

// Global room policy: students may control their focused player, including X
// (player pause), but may not alter the shared clock, reset, or timeline.
window.addEventListener('keydown', event => {
  if (!isStudent()) return
  if (event.repeat) return
  if (event.key.toLowerCase() === 'f') {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
}, true)

window.addEventListener('click', event => {
  if (!isStudent()) return
  const target = blockedElement(event.target)
  if (!target) return
  event.preventDefault()
  event.stopImmediatePropagation()
}, true)

window.addEventListener('pointerdown', event => {
  if (!isStudent()) return
  const target = blockedElement(event.target)
  if (!target) return
  event.preventDefault()
  event.stopImmediatePropagation()
}, true)

window.addEventListener('input', event => {
  if (!isStudent()) return
  const target = blockedElement(event.target)
  if (!target) return
  event.preventDefault()
  event.stopImmediatePropagation()
}, true)

window.addEventListener('change', event => {
  if (!isStudent()) return
  const target = blockedElement(event.target)
  if (!target) return
  event.preventDefault()
  event.stopImmediatePropagation()
}, true)
