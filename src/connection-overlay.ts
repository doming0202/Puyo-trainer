const COLS = 6
const ROWS = 12
const CELL_SIZE = 40
const CONTENT_OFFSET = 6
const CONNECTION_WIDTH = 9
const CONNECTION_OPACITY = '0.82'

const SVG_NS = 'http://www.w3.org/2000/svg'
const installedBoards = new WeakSet<HTMLElement>()
const scheduledBoards = new WeakSet<HTMLElement>()
const lastColors = new WeakMap<HTMLElement, Array<string | null>>()

function getCellColor(cell: HTMLElement): string | null {
  const puyo = cell.querySelector<HTMLElement>(':scope > .puyo')
  if (!puyo) return null
  return puyo.style.background || getComputedStyle(puyo).backgroundColor || null
}

function getCells(board: HTMLElement): HTMLElement[] {
  return Array.from(board.children).filter((child): child is HTMLElement =>
    child instanceof HTMLElement && child.classList.contains('cell'),
  )
}

function readColors(cells: HTMLElement[]): Array<string | null> {
  return cells.map(getCellColor)
}

function createLine(x1: number, y1: number, x2: number, y2: number, color: string): SVGLineElement {
  const line = document.createElementNS(SVG_NS, 'line')
  line.setAttribute('x1', String(x1))
  line.setAttribute('y1', String(y1))
  line.setAttribute('x2', String(x2))
  line.setAttribute('y2', String(y2))
  line.setAttribute('stroke', color)
  line.setAttribute('stroke-width', String(CONNECTION_WIDTH))
  line.setAttribute('stroke-linecap', 'round')
  line.setAttribute('stroke-opacity', CONNECTION_OPACITY)
  return line
}

function rebuildConnections(board: HTMLElement): void {
  scheduledBoards.delete(board)

  const cells = getCells(board)
  if (cells.length !== COLS * ROWS) return

  const colors = readColors(cells)
  lastColors.set(board, colors)

  const existing = board.querySelector<SVGSVGElement>(':scope > .puyo-connections')
  existing?.remove()

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.classList.add('puyo-connections')
  svg.setAttribute('viewBox', `0 0 ${COLS * CELL_SIZE} ${ROWS * CELL_SIZE}`)
  svg.setAttribute('width', String(COLS * CELL_SIZE))
  svg.setAttribute('height', String(ROWS * CELL_SIZE))
  svg.setAttribute('aria-hidden', 'true')
  svg.style.position = 'absolute'
  svg.style.left = `${CONTENT_OFFSET}px`
  svg.style.top = `${CONTENT_OFFSET}px`
  svg.style.width = `${COLS * CELL_SIZE}px`
  svg.style.height = `${ROWS * CELL_SIZE}px`
  svg.style.pointerEvents = 'none'
  svg.style.zIndex = '0'
  svg.style.overflow = 'visible'

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const index = y * COLS + x
      const color = colors[index]
      if (!color) continue

      const centerX = x * CELL_SIZE + CELL_SIZE / 2
      const centerY = y * CELL_SIZE + CELL_SIZE / 2

      if (x + 1 < COLS && colors[index + 1] === color) {
        svg.appendChild(createLine(centerX, centerY, centerX + CELL_SIZE, centerY, color))
      }

      if (y + 1 < ROWS && colors[index + COLS] === color) {
        svg.appendChild(createLine(centerX, centerY, centerX, centerY + CELL_SIZE, color))
      }
    }
  }

  board.style.position = 'relative'
  cells.forEach((cell) => {
    cell.style.position = 'relative'
    cell.style.zIndex = '1'
  })

  board.prepend(svg)
}

function scheduleRebuild(board: HTMLElement): void {
  if (scheduledBoards.has(board)) return
  scheduledBoards.add(board)
  requestAnimationFrame(() => rebuildConnections(board))
}

function indexOfCell(board: HTMLElement, cell: HTMLElement): number {
  return Array.prototype.indexOf.call(board.children, cell) - 1
}

function installBoard(board: HTMLElement): void {
  if (installedBoards.has(board)) {
    return
  }

  installedBoards.add(board)
  const cells = getCells(board)
  lastColors.set(board, readColors(cells))
  board.style.position = 'relative'
  scheduleRebuild(board)

  const observer = new MutationObserver((mutations) => {
    const colors = lastColors.get(board) ?? []
    let shouldRebuild = false

    for (const mutation of mutations) {
      if (!(mutation.target instanceof Element)) continue
      if (mutation.target.closest('.puyo-connections')) continue

      if (mutation.type === 'childList') {
        const changedOverlayOnly = [...mutation.addedNodes, ...mutation.removedNodes].every((node) =>
          node instanceof Element && node.classList.contains('puyo-connections'),
        )
        if (!changedOverlayOnly) {
          shouldRebuild = true
          break
        }
        continue
      }

      if (mutation.type !== 'attributes') continue

      const target = mutation.target as HTMLElement
      if (target.classList.contains('puyo')) {
        const cell = target.closest<HTMLElement>('.cell')
        if (!cell) continue
        const index = indexOfCell(board, cell)
        if (index < 0 || getCellColor(cell) !== colors[index]) {
          shouldRebuild = true
          break
        }
        continue
      }

      if (mutation.attributeName === 'class' && target.classList.contains('cell')) {
        shouldRebuild = true
        break
      }
    }

    if (shouldRebuild) scheduleRebuild(board)
  })

  observer.observe(board, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class'],
  })
}

function scanBoards(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('.board').forEach(installBoard)
}

scanBoards()

const rootObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    mutation.addedNodes.forEach((node) => {
      if (!(node instanceof Element)) return
      if (node.matches('.board')) installBoard(node as HTMLElement)
      scanBoards(node)
    })
  }
})

rootObserver.observe(document.body, { childList: true, subtree: true })
