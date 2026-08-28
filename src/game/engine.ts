import { playComboSound } from './sound'
import { recordTurnAction, redoTurnAction, resetToTurnStart, startNewTurn, undoTurnAction } from './history'
import { COLS, HIDDEN_ROWS, ROWS, TOTAL_ROWS, type ActivePair, type Board, type FallingCell, type GameState, type HiddenBoard, type Pair, type PlayerState, type PuyoColor, type Rotation } from './types'

export const COLORS: PuyoColor[] = [1, 2, 3, 4]
export const FALL_INTERVAL_MS = 900
export const LOCK_DELAY_MS = 500

export function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null))
}

export function emptyHiddenBoard(): HiddenBoard {
  return Array.from({ length: HIDDEN_ROWS }, () => Array<Cell>(COLS).fill(null))
}

type Cell = Board[number][number]

export function randomPair(): Pair { return { axis: randomColor(), child: randomColor() } }
function randomColor(): PuyoColor { return COLORS[Math.floor(Math.random() * COLORS.length)] }

export function createPlayer(controlMode: PlayerState['controlMode'] = 'human'): PlayerState {
  const first = randomPair()
  const base: Omit<PlayerState, 'turnStart' | 'undoStack' | 'redoStack'> = {
    board: emptyBoard(),
    hidden: emptyHiddenBoard(),
    current: spawnPair(first),
    next: [randomPair(), randomPair(), randomPair(), randomPair()],
    garbage: 0,
    score: 0,
    chain: 0,
    controlMode,
    alive: true,
    fallElapsedMs: 0,
    lockElapsedMs: 0,
    quickTurnArmed: false,
  }
  const player = { ...base, turnStart: structuredClone(base), undoStack: [], redoStack: [] }
  return player
}
export function createGame(): GameState { return { players: [createPlayer('human'), createPlayer('fixed')], activePlayer: 0, running: true, tick: 0 } }

/**
 * Spawn just above the visible field. The axis starts on the first visible row
 * and the child is allowed to begin in the hidden 13th row.
 */
export function spawnPair(pair: Pair): ActivePair { return { pair, x: 2, y: 0, rotation: 0 } }
const OFFSETS: Record<Rotation, readonly [number, number]> = { 0: [0, -1], 1: [1, 0], 2: [0, 1], 3: [-1, 0] }

export function cellsOf(pair: ActivePair): Array<{ x: number; y: number; color: PuyoColor }> {
  const [dx, dy] = OFFSETS[pair.rotation]
  return [
    { x: pair.x, y: pair.y, color: pair.pair.axis },
    { x: pair.x + dx, y: pair.y + dy, color: pair.pair.child },
  ]
}

function cellAt(player: PlayerState, x: number, y: number): PuyoColor | null {
  if (x < 0 || x >= COLS) return null
  if (y >= 0) return player.board[y]?.[x] ?? null
  const hiddenIndex = y + HIDDEN_ROWS
  if (hiddenIndex < 0 || hiddenIndex >= HIDDEN_ROWS) return null
  return player.hidden[hiddenIndex]?.[x] ?? null
}

/**
 * Active pairs may temporarily occupy the two rows above the visible field.
 * The axis itself may never enter the uppermost (14th) rotation-only row.
 */
export function canPlace(player: PlayerState, pair: ActivePair): boolean {
  const cells = cellsOf(pair)
  if (pair.y < -(HIDDEN_ROWS - 1)) return false
  return cells.every(({ x, y }) => {
    if (x < 0 || x >= COLS || y < -HIDDEN_ROWS || y >= ROWS) return false
    return cellAt(player, x, y) === null
  })
}

export function movePair(player: PlayerState, dx: number): PlayerState {
  if (!player.alive || player.resolution) return player
  const candidate = { ...player.current, x: player.current.x + dx }
  if (!canPlace(player, candidate)) return player
  return { ...player, current: candidate, lockElapsedMs: 0, quickTurnArmed: false }
}

export function rotatePair(player: PlayerState, direction: 1 | -1): PlayerState {
  if (!player.alive || player.resolution) return player

  const rotation = ((player.current.rotation + direction + 4) % 4) as Rotation
  const candidates = [
    { ...player.current, rotation },
    { ...player.current, rotation, x: player.current.x - 1 },
    { ...player.current, rotation, x: player.current.x + 1 },
  ]

  // At the visible ceiling, real Puyo rules allow the rotating pair to use
  // the off-screen space when the normal rotation is blocked. This is the
  // entry point needed for building 13th-row positions without resizing the UI.
  if (player.current.y === 0) {
    candidates.push(
      { ...player.current, rotation, y: -1 },
      { ...player.current, rotation, x: player.current.x - 1, y: -1 },
      { ...player.current, rotation, x: player.current.x + 1, y: -1 },
    )
  }

  const valid = candidates.find((candidate) => canPlace(player, candidate))

  if (valid) {
    return { ...player, current: valid, lockElapsedMs: 0, quickTurnArmed: false }
  }

  const vertical = player.current.rotation === 0 || player.current.rotation === 2
  if (!vertical) return { ...player, quickTurnArmed: false }

  const quickRotation = ((player.current.rotation + 2) % 4) as Rotation
  const quickCandidate = { ...player.current, rotation: quickRotation }
  if (!canPlace(player, quickCandidate)) return { ...player, quickTurnArmed: false }

  if (!player.quickTurnArmed) {
    return { ...player, quickTurnArmed: true, lockElapsedMs: 0 }
  }

  return { ...player, current: quickCandidate, quickTurnArmed: false, lockElapsedMs: 0 }
}

export function stepDown(player: PlayerState): PlayerState {
  if (!player.alive || player.resolution) return player
  const candidate = { ...player.current, y: player.current.y + 1 }
  if (!canPlace(player, candidate)) {
    return { ...player, lockElapsedMs: 0, quickTurnArmed: false }
  }
  return { ...player, current: candidate, fallElapsedMs: 0, lockElapsedMs: 0, quickTurnArmed: false }
}

export function advancePlayer(player: PlayerState, deltaMs: number): PlayerState {
  if (!player.alive || player.resolution) return player
  const delta = Math.max(0, deltaMs)
  const candidate = { ...player.current, y: player.current.y + 1 }

  if (!canPlace(player, candidate)) {
    const lockElapsedMs = player.lockElapsedMs + delta
    if (lockElapsedMs >= LOCK_DELAY_MS) return beginPlacement(player)
    return { ...player, lockElapsedMs }
  }

  const fallElapsedMs = player.fallElapsedMs + delta
  if (fallElapsedMs < FALL_INTERVAL_MS) return { ...player, fallElapsedMs, lockElapsedMs: 0 }

  return {
    ...player,
    current: candidate,
    fallElapsedMs: fallElapsedMs - FALL_INTERVAL_MS,
    lockElapsedMs: 0,
    quickTurnArmed: false,
  }
}

export function hardDrop(player: PlayerState): PlayerState {
  if (!player.alive || player.resolution) return player
  let current = player.current
  while (canPlace(player, { ...current, y: current.y + 1 })) current = { ...current, y: current.y + 1 }
  return beginPlacement({ ...player, current })
}

function writeCell(board: Board, hidden: HiddenBoard, x: number, y: number, color: PuyoColor): void {
  if (y >= 0 && y < ROWS) {
    board[y][x] = color
    return
  }
  const hiddenIndex = y + HIDDEN_ROWS
  if (hiddenIndex >= 0 && hiddenIndex < HIDDEN_ROWS) hidden[hiddenIndex][x] = color
}

function beginPlacement(player: PlayerState): PlayerState {
  const board = player.board.map((row) => [...row])
  const hidden = player.hidden.map((row) => [...row])
  for (const { x, y, color } of cellsOf(player.current)) {
    if (x >= 0 && x < COLS && y >= -HIDDEN_ROWS && y < ROWS) writeCell(board, hidden, x, y, color)
  }
  return { ...player, board, hidden, resolution: { stage: 'gravity', pendingGroups: [] }, chain: 0, fallElapsedMs: 0, lockElapsedMs: 0, quickTurnArmed: false }
}

function applyGravityWithOrigins(board: Board, hidden: HiddenBoard): { board: Board; hidden: HiddenBoard; fallingCells: FallingCell[] } {
  const combined: Board = [
    ...hidden.map((row) => [...row]),
    ...board.map((row) => [...row]),
  ]
  const result: Board = Array.from({ length: TOTAL_ROWS }, () => Array<Cell>(COLS).fill(null))
  const fallingCells: FallingCell[] = []

  // The 14th row is the rotation-space/wall row. Once a puyo is placed there,
  // it remains fixed while rows below continue to obey gravity.
  result[0] = [...combined[0]]

  for (let x = 0; x < COLS; x += 1) {
    const occupied: Array<{ y: number; color: PuyoColor }> = []
    for (let y = TOTAL_ROWS - 1; y >= 1; y -= 1) {
      const cell = combined[y][x]
      if (cell !== null) occupied.push({ y, color: cell })
    }

    occupied.forEach(({ y: fromCombinedY, color }, index) => {
      const targetCombinedY = TOTAL_ROWS - 1 - index
      result[targetCombinedY][x] = color
      const fromY = fromCombinedY - HIDDEN_ROWS
      const targetY = targetCombinedY - HIDDEN_ROWS
      if (fromY !== targetY) fallingCells.push({ x, y: targetY, fromY, color })
    })
  }

  return {
    hidden: result.slice(0, HIDDEN_ROWS),
    board: result.slice(HIDDEN_ROWS),
    fallingCells,
  }
}

export function advanceResolution(player: PlayerState): PlayerState {
  const resolution = player.resolution
  if (!resolution || !player.alive) return player

  if (resolution.stage === 'gravity') {
    const { board, hidden, fallingCells } = applyGravityWithOrigins(player.board, player.hidden)
    return {
      ...player,
      board,
      hidden,
      resolution: {
        stage: 'fall',
        pendingGroups: [],
        fallingCells,
      },
    }
  }

  if (resolution.stage === 'fall') {
    const groups = findGroups(player.board).filter((group) => group.length >= 4)
    if (groups.length === 0) return finishPlacement(player)
    const chain = player.chain + 1
    playComboSound(chain)
    return { ...player, chain, resolution: { stage: 'clear', pendingGroups: groups } }
  }

  const board = player.board.map((row) => [...row])
  let cleared = 0
  for (const group of resolution.pendingGroups) {
    cleared += group.length
    for (const { x, y } of group) board[y][x] = null
  }
  const colorBonus = Math.max(0, resolution.pendingGroups.length - 1) * 3
  const score = player.score + cleared * 10 * Math.max(1, player.chain + colorBonus)
  return { ...player, board, resolution: { stage: 'gravity', pendingGroups: [] } }
}

function finishPlacement(player: PlayerState): PlayerState {
  const nextPair = player.next[0] ?? randomPair()
  const next = [...player.next.slice(1), randomPair()]
  const nextCurrent = spawnPair(nextPair)
  if (!canPlace(player, nextCurrent)) return { ...player, alive: false, resolution: undefined, fallElapsedMs: 0, lockElapsedMs: 0, quickTurnArmed: false }
  return startNewTurn({ ...player, current: nextCurrent, next, resolution: undefined, fallElapsedMs: 0, lockElapsedMs: 0, quickTurnArmed: false })
}

function findGroups(board: Board): Array<Array<{ x: number; y: number }>> {
  const seen = new Set<string>()
  const groups: Array<Array<{ x: number; y: number }>> = []
  for (let y = 0; y < ROWS; y += 1) for (let x = 0; x < COLS; x += 1) {
    const color = board[y][x]
    const key = `${x},${y}`
    if (color === null || seen.has(key)) continue
    const queue = [{ x, y }]
    const group: Array<{ x: number; y: number }> = []
    seen.add(key)
    while (queue.length) {
      const current = queue.pop()!
      group.push(current)
      for (const [nx, ny] of [[current.x + 1, current.y], [current.x - 1, current.y], [current.x, current.y + 1], [current.x, current.y - 1]]) {
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || board[ny][nx] !== color) continue
        const neighborKey = `${nx},${ny}`
        if (seen.has(neighborKey)) continue
        seen.add(neighborKey)
        queue.push({ x: nx, y: ny })
      }
    }
    groups.push(group)
  }
  return groups
}

export type GameplayAction = 'left' | 'right' | 'rotate-left' | 'rotate-right' | 'soft-drop' | 'hard-drop' | 'reset-turn' | 'undo' | 'redo'

export function updatePlayer(player: PlayerState, action: GameplayAction): PlayerState {
  if (action === 'reset-turn') return resetToTurnStart(player)
  if (action === 'undo') return undoTurnAction(player)
  if (action === 'redo') return redoTurnAction(player)

  let next: PlayerState
  switch (action) {
    case 'left': next = movePair(player, -1); break
    case 'right': next = movePair(player, 1); break
    case 'rotate-left': next = rotatePair(player, -1); break
    case 'rotate-right': next = rotatePair(player, 1); break
    case 'soft-drop': next = stepDown(player); break
    case 'hard-drop': next = hardDrop(player); break
  }

  return recordTurnAction(player, next)
}
