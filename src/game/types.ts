export const COLS = 6
export const VISIBLE_ROWS = 12
export const HIDDEN_ROWS = 2
export const ROWS = VISIBLE_ROWS
export const TOTAL_ROWS = VISIBLE_ROWS + HIDDEN_ROWS

export type PuyoColor = 0 | 1 | 2 | 3 | 4
export type GarbageTier = 1 | 2 | 3 | 4 | 5
/** Runtime-only sentinel family for garbage variants. Values 5..9 encode tiers 1..5. */
export const GARBAGE_CELL = 5 as unknown as PuyoColor
export const GARBAGE_TIER_BASE = 5 as unknown as PuyoColor
export type Cell = PuyoColor | null
export type Board = Cell[][]
export type HiddenBoard = Cell[][]

export function isGarbageCell(cell: Cell): boolean {
  return typeof cell === 'number' && cell >= 5 && cell <= 9
}

export function garbageCellForTier(tier: GarbageTier): PuyoColor {
  return (GARBAGE_TIER_BASE + tier - 1) as unknown as PuyoColor
}

export function getGarbageTier(cell: Cell): GarbageTier {
  if (!isGarbageCell(cell)) return 1
  return (cell - GARBAGE_TIER_BASE + 1) as GarbageTier
}

export type Rotation = 0 | 1 | 2 | 3

export interface Pair {
  axis: PuyoColor
  child: PuyoColor
  } 

export interface ActivePair {
  pair: Pair
  x: number
  y: number
  rotation: Rotation
}

export type ControlMode = 'human' | 'replay' | 'fixed' | 'none' | 'game-over'

export interface GroupCell {
  x: number
  y: number
}

export interface FallingCell {
  x: number
  y: number
  fromY: number
  color: PuyoColor
}

export interface ResolutionState {
  stage: 'gravity' | 'fall' | 'clear'
  pendingGroups: GroupCell[][]
  fallingCells?: FallingCell[]
}

export interface TurnState {
  board: Board
  /** Two rows above the visible field: 13th row (index 1) and 14th row (index 0). */
  hidden: HiddenBoard
  current: ActivePair
  next: Pair[]
  garbage: number
  score: number
  chain: number
  controlMode: ControlMode
  alive: boolean
  resolution?: ResolutionState
  fallElapsedMs: number
  lockElapsedMs: number
  quickTurnArmed: boolean
}

export interface TurnHistoryEntry {
  state: TurnState
  turnStart: TurnState
  undoStack: TurnState[]
}

export interface PlayerState extends TurnState {
  /** State immediately after the current falling puyo appeared. */
  turnStart: TurnState
  /** Turn-start states for previously played falling puyos, newest last. */
  undoStack: TurnState[]
  /** Exact states captured when stepping backward, newest last. */
  redoStack: TurnHistoryEntry[]
}

export interface GameState {
  players: [PlayerState, PlayerState]
  activePlayer: 0 | 1
  running: boolean
  tick: number
}
