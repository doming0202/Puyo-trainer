import { useEffect, useState } from 'react'
import type { PuyoColor } from './types'

export type ColorPalette = Record<Exclude<PuyoColor, 0>, string>

export const COLOR_ORDER: Exclude<PuyoColor, 0>[] = [1, 2, 3, 5, 4]
export const COLOR_NAMES: Record<Exclude<PuyoColor, 0>, string> = {
  1: '赤',
  2: '青',
  3: '緑',
  4: '紫',
  5: '黄',
}

export const DEFAULT_COLOR_PALETTE: ColorPalette = {
  1: '#ff5b68',
  2: '#5aa7ff',
  3: '#58d68d',
  4: '#b66cff',
  5: '#ffd45a',
}

const STORAGE_KEY = 'puyo-trainer-color-palette-v1'
const EVENT_NAME = 'puyo-color-palette-changed'

function normalizeColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
}

export function loadColorPalette(): ColorPalette {
  if (typeof window === 'undefined') return { ...DEFAULT_COLOR_PALETTE }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Record<string, unknown>>
    return {
      1: normalizeColor(parsed['1'], DEFAULT_COLOR_PALETTE[1]),
      2: normalizeColor(parsed['2'], DEFAULT_COLOR_PALETTE[2]),
      3: normalizeColor(parsed['3'], DEFAULT_COLOR_PALETTE[3]),
      4: normalizeColor(parsed['4'], DEFAULT_COLOR_PALETTE[4]),
      5: normalizeColor(parsed['5'], DEFAULT_COLOR_PALETTE[5]),
    }
  } catch {
    return { ...DEFAULT_COLOR_PALETTE }
  }
}

export function saveColorPalette(palette: ColorPalette): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(palette))
  } catch {
    // Ignore storage failures; the current session still works.
  }
}

export function applyColorPalette(palette: ColorPalette): void {
  if (typeof document === 'undefined') return
  for (const color of COLOR_ORDER) document.documentElement.style.setProperty(`--puyo-color-${color}`, palette[color])
  window.dispatchEvent(new Event(EVENT_NAME))
}

export function setColorPaletteValue(palette: ColorPalette, color: Exclude<PuyoColor, 0>, value: string): ColorPalette {
  return { ...palette, [color]: value }
}

export function resetColorPalette(): ColorPalette {
  const palette = { ...DEFAULT_COLOR_PALETTE }
  saveColorPalette(palette)
  applyColorPalette(palette)
  return palette
}

export function useColorPalette(): ColorPalette {
  const [palette, setPalette] = useState<ColorPalette>(() => loadColorPalette())
  useEffect(() => {
    const onChange = () => setPalette(loadColorPalette())
    window.addEventListener(EVENT_NAME, onChange)
    return () => window.removeEventListener(EVENT_NAME, onChange)
  }, [])
  return palette
}

if (typeof window !== 'undefined') applyColorPalette(loadColorPalette())
