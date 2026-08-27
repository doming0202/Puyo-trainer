import type { ActivePair, Board, GameState, Pair, PlayerState, PuyoColor } from './types'

export const EDITABLE_COLORS: PuyoColor[] = [1, 2, 3, 4]

export function setPairColors(player: PlayerState, axis: PuyoColor, child: PuyoColor): PlayerState {
  return { ...player, current: { ...player.current, pair: { axis, child } } }
}

export function setPairRotation(player: PlayerState, rotation: ActivePair['rotation']): PlayerState {
  return { ...player, current: { ...player.current, rotation } }
}

export function setNextPair(player: PlayerState, index: number, pair: Pair): PlayerState {
  if (index < 0 || index >= player.next.length) return player
  const next = player.next.map((value, i) => i === index ? { ...pair } : value)
  return { ...player, next }
}

export function setGarbage(player: PlayerState, garbage: number): PlayerState {
  return { ...player, garbage: Math.max(0, Math.floor(garbage)) }
}

export function setBoardCell(game: GameState, playerIndex: 0 | 1, x: number, y: number, color: PuyoColor | null): GameState {
  if (x < 0 || x >= game.players[playerIndex].board[0].length || y < 0 || y >= game.players[playerIndex].board.length) return game
  const players: [PlayerState, PlayerState] = [...game.players] as [PlayerState, PlayerState]
  const board: Board = players[playerIndex].board.map((row) => [...row])
  board[y][x] = color
  players[playerIndex] = { ...players[playerIndex], board }
  return { ...game, players }
}

export function setPlayer(player: PlayerState, patch: Partial<Pick<PlayerState, 'current' | 'next' | 'garbage'>>): PlayerState {
  return { ...player, ...patch }
}
