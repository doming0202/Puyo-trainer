export const MIN_FALL_SPEED = 0.2
export const MAX_FALL_SPEED = 2.0
export const FALL_SPEED_STEP = 0.1

let fallSpeedMultiplier = 1.0
const listeners = new Set<(speed: number) => void>()

export function getFallSpeedMultiplier(): number {
  return fallSpeedMultiplier
}

export function getFallIntervalMs(baseIntervalMs = 900): number {
  return baseIntervalMs / fallSpeedMultiplier
}

export function setFallSpeedMultiplier(speed: number): void {
  const next = Math.min(MAX_FALL_SPEED, Math.max(MIN_FALL_SPEED, Math.round(speed * 10) / 10))
  if (next === fallSpeedMultiplier) return
  fallSpeedMultiplier = next
  listeners.forEach((listener) => listener(fallSpeedMultiplier))
}

export function increaseFallSpeed(): void {
  setFallSpeedMultiplier(fallSpeedMultiplier + FALL_SPEED_STEP)
}

export function decreaseFallSpeed(): void {
  setFallSpeedMultiplier(fallSpeedMultiplier - FALL_SPEED_STEP)
}

export function subscribeFallSpeed(listener: (speed: number) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
