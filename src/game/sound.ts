let audioContext: AudioContext | null = null

const MOVE_SOUND_URL = '/sounds/cursor-move-4.mp3'
const ROTATE_SOUND_URL = '/sounds/cancel-1.mp3'

function playAsset(url: string, volume = 0.75): void {
  if (typeof window === 'undefined') return
  const audio = new Audio(url)
  audio.volume = volume
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
  if (!context) return

  const safeChain = Math.max(1, Math.floor(chain))
  const now = context.currentTime
  const frequency = Math.min(1320, 392 * Math.pow(2, ((safeChain - 1) * 2) / 12))

  const oscillator = context.createOscillator()
  const gain = context.createGain()

  oscillator.type = 'triangle'
  oscillator.frequency.setValueAtTime(frequency, now)
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.035, now + 0.045)

  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.012)
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
