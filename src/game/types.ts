export const COLS = 6
export const ROWS = 12
export const VISIBLE_ROWS = 11

export type PuyoColor = 0 | 1 | 2 | 3 | 4
export type Cell = PuyoColor | null
export type Board = Cell[][]

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

export interface PlayerState extends TurnState {
  /** State of this player's current falling puyo immediately after it appeared. */
  turnStart: TurnState
  /** One entry per manual gameplay operation, newest entry last. */
  undoStack: TurnState[]
}

export interface GameState {
  players: [PlayerState, PlayerState]
  activePlayer: 0 | 1
  running: boolean
  tick: number
}
