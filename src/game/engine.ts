import { COLS, ROWS, type ActivePair, type Board, type GameState, type Pair, type PlayerState, type PuyoColor, type Rotation } from './types'

export const COLORS: PuyoColor[] = [1, 2, 3, 4, 5]

export function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null))
}

type Cell = Board[number][number]

export function randomPair(): Pair { return { axis: randomColor(), child: randomColor() } }
function randomColor(): PuyoColor { return COLORS[Math.floor(Math.random() * COLORS.length)] }

export function createPlayer(controlMode: PlayerState['controlMode'] = 'human'): PlayerState {
  const first = randomPair()
  return { board: emptyBoard(), current: spawnPair(first), next: [randomPair(), randomPair(), randomPair(), randomPair()], garbage: 0, score: 0, chain: 0, controlMode, alive: true }
}
export function createGame(): GameState { return { players: [createPlayer('human'), createPlayer('fixed')], activePlayer: 0, running: true, tick: 0 } }
export function spawnPair(pair: Pair): ActivePair { return { pair, x: 2, y: 1, rotation: 0 } }
const OFFSETS: Record<Rotation, readonly [number, number]> = { 0: [0, -1], 1: [1, 0], 2: [0, 1], 3: [-1, 0] }
export function cellsOf(pair: ActivePair): Array<{ x: number; y: number; color: PuyoColor }> { const [dx, dy] = OFFSETS[pair.rotation]; return [{ x: pair.x, y: pair.y, color: pair.pair.axis }, { x: pair.x + dx, y: pair.y + dy, color: pair.pair.child }] }
export function canPlace(board: Board, pair: ActivePair): boolean { return cellsOf(pair).every(({ x, y }) => x >= 0 && x < COLS && y >= 0 && y < ROWS && board[y][x] === null) }
export function movePair(player: PlayerState, dx: number): PlayerState { if (!player.alive || player.resolution) return player; const candidate = { ...player.current, x: player.current.x + dx }; return canPlace(player.board, candidate) ? { ...player, current: candidate } : player }
export function rotatePair(player: PlayerState, direction: 1 | -1): PlayerState { if (!player.alive || player.resolution) return player; const rotation = ((player.current.rotation + direction + 4) % 4) as Rotation; const candidates = [{ ...player.current, rotation }, { ...player.current, rotation, x: player.current.x - 1 }, { ...player.current, rotation, x: player.current.x + 1 }]; const valid = candidates.find((candidate) => canPlace(player.board, candidate)); return valid ? { ...player, current: valid } : player }
export function stepDown(player: PlayerState): PlayerState { if (!player.alive || player.resolution) return player; const candidate = { ...player.current, y: player.current.y + 1 }; return canPlace(player.board, candidate) ? { ...player, current: candidate } : beginPlacement(player) }
export function hardDrop(player: PlayerState): PlayerState { if (!player.alive || player.resolution) return player; let current = player.current; while (canPlace(player.board, { ...current, y: current.y + 1 })) current = { ...current, y: current.y + 1 }; return beginPlacement({ ...player, current }) }
function beginPlacement(player: PlayerState): PlayerState { const board = player.board.map((row) => [...row]); for (const { x, y, color } of cellsOf(player.current)) if (y >= 0 && y < ROWS && x >= 0 && x < COLS) board[y][x] = color; return { ...player, board, resolution: { stage: 'gravity', pendingGroups: [] }, chain: 0 } }
export function advanceResolution(player: PlayerState): PlayerState {
  const resolution = player.resolution; if (!resolution || !player.alive) return player
  if (resolution.stage === 'gravity') {
    const board = applyGravity(player.board); const groups = findGroups(board).filter((group) => group.length >= 4)
    if (groups.length === 0) return finishPlacement({ ...player, board })
    return { ...player, board, chain: player.chain + 1, resolution: { stage: 'clear', pendingGroups: groups } }
  }
  const board = player.board.map((row) => [...row]); let cleared = 0
  for (const group of resolution.pendingGroups) { cleared += group.length; for (const { x, y } of group) board[y][x] = null }
  const colorBonus = Math.max(0, resolution.pendingGroups.length - 1) * 3; const score = player.score + cleared * 10 * Math.max(1, player.chain + colorBonus)
  return { ...player, board, score, resolution: { stage: 'gravity', pendingGroups: [] } }
}
function finishPlacement(player: PlayerState): PlayerState {
  const nextPair = player.next[0] ?? randomPair(); const next = [...player.next.slice(1), randomPair()]; const nextCurrent = spawnPair(nextPair)
  if (!canPlace(player.board, nextCurrent)) return { ...player, alive: false, resolution: undefined }
  return { ...player, current: nextCurrent, next, resolution: undefined }
}
function findGroups(board: Board): Array<Array<{ x: number; y: number }>> {
  const seen = new Set<string>(); const groups: Array<Array<{ x: number; y: number }>> = []
  for (let y = 0; y < ROWS; y += 1) for (let x = 0; x < COLS; x += 1) { const color = board[y][x]; const key = `${x},${y}`; if (color === null || seen.has(key)) continue; const queue = [{ x, y }]; const group: Array<{ x: number; y: number }> = []; seen.add(key); while (queue.length) { const current = queue.pop()!; group.push(current); for (const [nx, ny] of [[current.x + 1, current.y], [current.x - 1, current.y], [current.x, current.y + 1], [current.x, current.y - 1]]) { if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || board[ny][nx] !== color) continue; const neighborKey = `${nx},${ny}`; if (seen.has(neighborKey)) continue; seen.add(neighborKey); queue.push({ x: nx, y: ny }) } } groups.push(group) }
  return groups
}
function applyGravity(board: Board): Board { const result = emptyBoard(); for (let x = 0; x < COLS; x += 1) { let write = ROWS - 1; for (let y = ROWS - 1; y >= 0; y -= 1) { const cell = board[y][x]; if (cell !== null) { result[write][x] = cell; write -= 1 } } } return result }
export function updatePlayer(player: PlayerState, action: 'left' | 'right' | 'rotate-left' | 'rotate-right' | 'soft-drop' | 'hard-drop'): PlayerState { switch (action) { case 'left': return movePair(player, -1); case 'right': return movePair(player, 1); case 'rotate-left': return rotatePair(player, -1); case 'rotate-right': return rotatePair(player, 1); case 'soft-drop': return stepDown(player); case 'hard-drop': return hardDrop(player) } }
