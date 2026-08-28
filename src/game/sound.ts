let audioContext: AudioContext | null = null

const MOVE_SOUND_URL = '/sounds/cursor-move-4.mp3'
const ROTATE_SOUND_URL = '/sounds/cancel-1.mp3'
const VOLUME_STORAGE_KEY = 'puyo-trainer-master-volume'
const DEFAULT_MASTER_VOLUME = 1

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : DEFAULT_MASTER_VOLUME))
}

function loadMasterVolume(): number {
  if (typeof window === 'undefined') return DEFAULT_MASTER_VOLUME
  try {
    const stored = Number.parseFloat(window.localStorage.getItem(VOLUME_STORAGE_KEY) ?? '')
    return Number.isFinite(stored) ? clampVolume(stored) : DEFAULT_MASTER_VOLUME
  } catch {
    return DEFAULT_MASTER_VOLUME
  }
}

let masterVolume = loadMasterVolume()

export function getMasterVolume(): number {
  return masterVolume
}

export function setMasterVolume(value: number): void {
  masterVolume = clampVolume(value)
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(VOLUME_STORAGE_KEY, String(masterVolume))
  } catch {
    // Ignore storage failures and keep the in-memory volume.
  }
}

function playAsset(url: string, volume = 0.75): void {
  if (typeof window === 'undefined' || masterVolume <= 0) return
  const audio = new Audio(url)
  audio.volume = clampVolume(volume * masterVolume)
  void audio.play().catch(() => undefined)
}

export function playMoveSound(): void {
  playAsset(MOVE_SOUND_URL)
}

export function playRotateSound(): void {
  playAsset(ROTATE_SOUND_URL)
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null
  audioContext ??= new AudioContext()
  if (audioContext.state === 'suspended') void audioContext.resume()
  return audioContext
}

export function unlockComboAudio(): void {
  const context = getAudioContext()
  if (context?.state === 'suspended') void context.resume()
}

export function playComboSound(chain: number): void {
  const context = getAudioContext()
  if (!context || masterVolume <= 0) return

  const safeChain = Math.max(1, Math.floor(chain))
  const now = context.currentTime
  const frequency = Math.min(1320, 392 * Math.pow(2, ((safeChain - 1) * 2) / 12))

  const oscillator = context.createOscillator()
  const gain = context.createGain()

  oscillator.type = 'triangle'
  oscillator.frequency.setValueAtTime(frequency, now)
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.035, now + 0.045)

  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.16 * masterVolume, now + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)

  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start(now)
  oscillator.stop(now + 0.19)
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlockComboAudio, { once: true })
  window.addEventListener('keydown', unlockComboAudio, { once: true })
}
