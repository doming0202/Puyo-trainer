import { playComboSound, playMoveSound, playRotateSound } from './sound'
import { recordTurnAction, redoTurnAction, resetToTurnStart, startNewTurn, undoTurnAction } from './history'
import { COLS, HIDDEN_ROWS, ROWS, TOTAL_ROWS, garbageCellForTier, isGarbageCell, type ActivePair, type Board, type Cell, type FallingCell, type GameState, type HiddenBoard, type Pair, type PlayerState, type PuyoColor, type Rotation, type GarbageTier } from './types'
import { getFallIntervalMs } from './fall-speed'
import { createPuyoSequence, nextSequencePair, type PuyoSequenceDebugState } from './puyo-sequence'

export const COLORS: PuyoColor[] = [1, 2, 3, 4]
export const FALL_INTERVAL_MS = 900
export const LOCK_DELAY_MS = 500

export function emptyBoard(): Board { return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null)) }
export function emptyHiddenBoard(): HiddenBoard { return Array.from({ length: HIDDEN_ROWS }, () => Array<Cell>(COLS).fill(null)) }

/** Legacy helper retained for editor/compatibility callers. */
export function randomPair(): Pair { return { axis: randomColor(), child: randomColor() } }
function randomColor(): PuyoColor { return COLORS[Math.floor(Math.random() * COLORS.length)] }
function takePair(state: PuyoSequenceDebugState): { pair: Pair; state: PuyoSequenceDebugState } { return nextSequencePair(state) }

export function createPlayer(controlMode: PlayerState['controlMode'] = 'human'): PlayerState {
  let sequenceState = createPuyoSequence()
  const first = takePair(sequenceState)
  sequenceState = first.state
  const nextPairs: Pair[] = []
  for (let i = 0; i < 4; i += 1) {
    const result = takePair(sequenceState)
    nextPairs.push(result.pair)
    sequenceState = result.state
  }
  const base: Omit<PlayerState, 'turnStart' | 'undoStack' | 'redoStack'> = {
    board: emptyBoard(),
    hidden: emptyHiddenBoard(),
    current: spawnPair(first.pair),
    next: nextPairs,
    puyoSequence: sequenceState.sequence,
    puyoSequenceIndex: sequenceState.index,
    puyoSequenceSeed: sequenceState.seed,
    incomingGarbage: 0,
    garbage: 0,
    score: 0,
    chain: 0,
    controlMode,
    alive: true,
    fallElapsedMs: 0,
    lockElapsedMs: 0,
    quickTurnArmed: false,
  }
  return { ...base, turnStart: structuredClone(base), undoStack: [], redoStack: [] }
}
export function createGame(): GameState { return { players: [createPlayer('human'), createPlayer('fixed')], activePlayer: 0, running: true, tick: 0 } }

export function spawnPair(pair: Pair): ActivePair { return { pair, x: 2, y: 0, rotation: 0 } }
const OFFSETS: Record<Rotation, readonly [number, number]> = { 0: [0, -1], 1: [1, 0], 2: [0, 1], 3: [-1, 0] }
export function cellsOf(pair: ActivePair): Array<{ x: number; y: number; color: PuyoColor }> {
  const [dx, dy] = OFFSETS[pair.rotation]
  return [{ x: pair.x, y: pair.y, color: pair.pair.axis }, { x: pair.x + dx, y: pair.y + dy, color: pair.pair.child }]
}
function cellAt(player: PlayerState, x: number, y: number): Cell {
  if (x < 0 || x >= COLS) return null
  if (y >= 0) return player.board[y]?.[x] ?? null
  const hiddenIndex = y + HIDDEN_ROWS
  if (hiddenIndex < 0 || hiddenIndex >= HIDDEN_ROWS) return null
  return player.hidden[hiddenIndex]?.[x] ?? null
}
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
  playMoveSound()
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
  if (player.current.y === 0) candidates.push({ ...player.current, rotation, y: -1 }, { ...player.current, rotation, x: player.current.x - 1, y: -1 }, { ...player.current, rotation, x: player.current.x + 1, y: -1 })
  const valid = candidates.find((candidate) => canPlace(player, candidate))
  if (valid) { playRotateSound(); return { ...player, current: valid, lockElapsedMs: 0, quickTurnArmed: false } }
  const vertical = player.current.rotation === 0 || player.current.rotation === 2
  if (!vertical) return { ...player, quickTurnArmed: false }
  const quickRotation = ((player.current.rotation + 2) % 4) as Rotation
  const quickCandidate = { ...player.current, rotation: quickRotation }
  if (!canPlace(player, quickCandidate)) return { ...player, quickTurnArmed: false }
  if (!player.quickTurnArmed) return { ...player, quickTurnArmed: true, lockElapsedMs: 0 }
  playRotateSound()
  return { ...player, current: quickCandidate, quickTurnArmed: false, lockElapsedMs: 0 }
}
export function stepDown(player: PlayerState): PlayerState {
  if (!player.alive || player.resolution) return player
  const candidate = { ...player.current, y: player.current.y + 1 }
  if (!canPlace(player, candidate)) return { ...player, lockElapsedMs: 0, quickTurnArmed: false }
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
  const fallIntervalMs = getFallIntervalMs(FALL_INTERVAL_MS)
  if (fallElapsedMs < fallIntervalMs) return { ...player, fallElapsedMs, lockElapsedMs: 0 }
  return { ...player, current: candidate, fallElapsedMs: fallElapsedMs - fallIntervalMs, lockElapsedMs: 0, quickTurnArmed: false }
}
export function hardDrop(player: PlayerState): PlayerState {
  if (!player.alive || player.resolution) return player
  let current = player.current
  while (canPlace(player, { ...current, y: current.y + 1 })) current = { ...current, y: current.y + 1 }
  return beginPlacement({ ...player, current })
}
function writeCell(board: Board, hidden: HiddenBoard, x: number, y: number, color: PuyoColor): void {
  if (y >= 0 && y < ROWS) { board[y][x] = color; return }
  const hiddenIndex = y + HIDDEN_ROWS
  if (hiddenIndex >= 0 && hiddenIndex < HIDDEN_ROWS) hidden[hiddenIndex][x] = color
}
function beginPlacement(player: PlayerState): PlayerState {
  const board = player.board.map((row) => [...row])
  const hidden = player.hidden.map((row) => [...row])
  for (const { x, y, color } of cellsOf(player.current)) if (x >= 0 && x < COLS && y >= -HIDDEN_ROWS && y < ROWS) writeCell(board, hidden, x, y, color)
  return { ...player, board, hidden, resolution: { stage: 'gravity', pendingGroups: [] }, chain: 0, fallElapsedMs: 0, lockElapsedMs: 0, quickTurnArmed: false }
}
function applyGravityWithOrigins(board: Board, hidden: HiddenBoard): { board: Board; hidden: HiddenBoard; fallingCells: FallingCell[] } {
  const combined: Board = [...hidden.map((row) => [...row]), ...board.map((row) => [...row])]
  const result: Board = Array.from({ length: TOTAL_ROWS }, () => Array<Cell>(COLS).fill(null))
  const fallingCells: FallingCell[] = []
  result[0] = [...combined[0]]
  for (let x = 0; x < COLS; x += 1) {
    const occupied: Array<{ y: number; color: PuyoColor }> = []
    for (let y = TOTAL_ROWS - 1; y >= 1; y -= 1) { const cell = combined[y][x]; if (cell !== null) occupied.push({ y, color: cell }) }
    occupied.forEach(({ y: fromCombinedY, color }, index) => {
      const targetCombinedY = TOTAL_ROWS - 1 - index
      result[targetCombinedY][x] = color
      const fromY = fromCombinedY - HIDDEN_ROWS
      const targetY = targetCombinedY - HIDDEN_ROWS
      if (fromY !== targetY) fallingCells.push({ x, y: targetY, fromY, color })
    })
  }
  return { hidden: result.slice(0, HIDDEN_ROWS), board: result.slice(HIDDEN_ROWS), fallingCells }
}
export function getGarbageTierForCount(count: number): GarbageTier {
  const pending = Math.max(0, Math.floor(count))
  if (pending >= 48) return 5
  if (pending >= 24) return 4
  if (pending >= 12) return 3
  if (pending >= 6) return 2
  return 1
}
export function calculateGarbageAttack(cleared: number, chain: number, groupCount: number): number {
  const base = Math.floor(Math.max(0, cleared) / 4)
  const chainBonus = Math.max(0, Math.floor(chain) - 1)
  const groupBonus = Math.max(0, Math.floor(groupCount) - 1)
  return Math.max(1, base + chainBonus + groupBonus)
}
function applyIncomingGarbage(player: PlayerState): PlayerState {
  const pending = Math.max(0, Math.floor(player.incomingGarbage))
  if (pending === 0) return player
  const board = player.board.map((row) => [...row])
  const hidden = player.hidden.map((row) => [...row])
  const fullRows = Math.floor(pending / COLS)
  const remainder = pending % COLS
  const placementColumns: number[] = []
  const garbageCell = garbageCellForTier(getGarbageTierForCount(pending))
  for (let row = 0; row < fullRows; row += 1) for (let x = 0; x < COLS; x += 1) placementColumns.push(x)
  if (remainder > 0) {
    const shuffledColumns = Array.from({ length: COLS }, (_, x) => x)
    for (let i = shuffledColumns.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [shuffledColumns[i], shuffledColumns[j]] = [shuffledColumns[j], shuffledColumns[i]] }
    placementColumns.push(...shuffledColumns.slice(0, remainder))
  }
  const placeAtTopOfColumn = (x: number): boolean => {
    for (let y = ROWS - 1; y >= -HIDDEN_ROWS; y -= 1) {
      const cell = y >= 0 ? board[y][x] : hidden[y + HIDDEN_ROWS][x]
      if (cell !== null) continue
      writeCell(board, hidden, x, y, garbageCell)
      return true
    }
    return false
  }
  for (const x of placementColumns) if (!placeAtTopOfColumn(x)) return { ...player, board, hidden, garbage: 0, incomingGarbage: 0, alive: false, resolution: undefined, fallElapsedMs: 0, lockElapsedMs: 0, quickTurnArmed: false }
  return { ...player, board, hidden, garbage: 0, incomingGarbage: 0 }
}
export interface ResolutionAdvanceResult { player: PlayerState; attack: number }
export function advanceResolution(player: PlayerState): ResolutionAdvanceResult {
  const resolution = player.resolution
  if (!resolution || !player.alive) return { player, attack: 0 }
  if (resolution.stage === 'gravity') {
    const { board, hidden, fallingCells } = applyGravityWithOrigins(player.board, player.hidden)
    return { player: { ...player, board, hidden, resolution: { stage: 'fall', pendingGroups: [], fallingCells } }, attack: 0 }
  }
  if (resolution.stage === 'fall') {
    const groups = findGroups(player.board).filter((group) => group.length >= 4)
    if (groups.length === 0) return { player: finishPlacement(player), attack: 0 }
    const chain = player.chain + 1
    playComboSound(chain)
    return { player: { ...player, chain, resolution: { stage: 'clear', pendingGroups: groups } }, attack: 0 }
  }
  const board = player.board.map((row) => [...row])
  let cleared = 0
  const garbageToClear = new Set<string>()
  for (const group of resolution.pendingGroups) {
    cleared += group.length
    for (const { x, y } of group) {
      board[y][x] = null
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue
        if (isGarbageCell(board[ny][nx])) garbageToClear.add(`${nx},${ny}`)
      }
    }
  }
  for (const key of garbageToClear) { const [x, y] = key.split(',').map(Number); board[y][x] = null }
  const colorBonus = Math.max(0, resolution.pendingGroups.length - 1) * 3
  const score = player.score + cleared * 10 * Math.max(1, player.chain + colorBonus)
  const attack = calculateGarbageAttack(cleared, player.chain, resolution.pendingGroups.length)
  const incomingGarbage = Math.max(0, Math.floor(player.incomingGarbage))
  const canceled = Math.min(incomingGarbage, attack)
  const remainingIncoming = incomingGarbage - canceled
  const outgoingAttack = attack - canceled
  return { player: { ...player, board, score, incomingGarbage: remainingIncoming, garbage: remainingIncoming, resolution: { stage: 'gravity', pendingGroups: [] } }, attack: outgoingAttack }
}
function finishPlacement(player: PlayerState): PlayerState {
  const withGarbage = applyIncomingGarbage(player)
  if (!withGarbage.alive) return withGarbage
  const sequenceState: PuyoSequenceDebugState = { seed: withGarbage.puyoSequenceSeed, sequence: withGarbage.puyoSequence, index: withGarbage.puyoSequenceIndex }
  const nextSequence = takePair(sequenceState)
  const next: Pair[] = [...withGarbage.next.slice(1), nextSequence.pair]
  const nextCurrent = spawnPair(withGarbage.next[0] ?? nextSequence.pair)
  if (!canPlace(withGarbage, nextCurrent)) return { ...withGarbage, alive: false, resolution: undefined, fallElapsedMs: 0, lockElapsedMs: 0, quickTurnArmed: false }
  return startNewTurn({ ...withGarbage, current: nextCurrent, next, puyoSequence: nextSequence.state.sequence, puyoSequenceIndex: nextSequence.state.index, puyoSequenceSeed: nextSequence.state.seed, resolution: undefined, fallElapsedMs: 0, lockElapsedMs: 0, quickTurnArmed: false })
}
function findGroups(board: Board): Array<Array<{ x: number; y: number }>> {
  const seen = new Set<string>()
  const groups: Array<Array<{ x: number; y: number }>> = []
  for (let y = 0; y < ROWS; y += 1) for (let x = 0; x < COLS; x += 1) {
    const color = board[y][x]
    const key = `${x},${y}`
    if (color === null || color === 0 || isGarbageCell(color) || seen.has(key)) continue
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
