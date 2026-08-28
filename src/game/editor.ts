import type { ActivePair, Board, GameState, Pair, PlayerState, PuyoColor } from './types'
import { COLOR_ORDER } from './colors'

export const EDITABLE_COLORS: PuyoColor[] = COLOR_ORDER

export function setPairColors(player: PlayerState, axis: PuyoColor, child: PuyoColor): PlayerState { return { ...player, current: { ...player.current, pair: { axis, child } } } }
export function setPairRotation(player: PlayerState, rotation: ActivePair['rotation']): PlayerState { return { ...player, current: { ...player.current, rotation } } }
export function setNextPair(player: PlayerState, index: number, pair: Pair): PlayerState { if (index < 0 || index >= player.next.length) return player; const next = player.next.map((value, i) => i === index ? { ...pair } : value); return { ...player, next } }
export function setGarbage(player: PlayerState, garbage: number): PlayerState { return { ...player, garbage: Math.max(0, Math.floor(garbage)) } }
export function setBoardCell(game: GameState, playerIndex: 0 | 1, x: number, y: number, color: PuyoColor | null): GameState { if (x < 0 || x >= game.players[playerIndex].board[0].length || y < 0 || y >= game.players[playerIndex].board.length) return game; const players: [PlayerState, PlayerState] = [...game.players] as [PlayerState, PlayerState]; const board: Board = players[playerIndex].board.map((row) => [...row]); board[y][x] = color; players[playerIndex] = { ...players[playerIndex], board }; return { ...game, players } }
export function clearBoard(game: GameState, playerIndex: 0 | 1): GameState { const players: [PlayerState, PlayerState] = [...game.players] as [PlayerState, PlayerState]; const board: Board = players[playerIndex].board.map((row) => row.map(() => null)); players[playerIndex] = { ...players[playerIndex], board }; return { ...game, players } }
export function fillBoard(game: GameState, playerIndex: 0 | 1, color: PuyoColor): GameState { const players: [PlayerState, PlayerState] = [...game.players] as [PlayerState, PlayerState]; const board: Board = players[playerIndex].board.map((row) => row.map(() => color)); players[playerIndex] = { ...players[playerIndex], board }; return { ...game, players } }
export function cycleBoardColor(color: PuyoColor | null): PuyoColor | null { if (color === null) return EDITABLE_COLORS[0]; const index = EDITABLE_COLORS.indexOf(color); return index < 0 || index === EDITABLE_COLORS.length - 1 ? null : EDITABLE_COLORS[index + 1] }
export function setPlayer(player: PlayerState, patch: Partial<Pick<PlayerState, 'current' | 'next' | 'garbage'>>): PlayerState { return { ...player, ...patch } }
