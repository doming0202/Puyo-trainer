const PARTICLE_DIRECTIONS = [
  ['0px', '-18px'],
  ['12px', '-14px'],
  ['19px', '-2px'],
  ['15px', '11px'],
  ['4px', '19px'],
  ['-10px', '15px'],
  ['-19px', '4px'],
  ['-15px', '-10px'],
  ['8px', '-20px'],
  ['-7px', '21px'],
] as const

const STYLE_ID = 'puyo-clear-effects-style'

function installStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .clearing-cell { position: relative; overflow: visible; z-index: 3; }
    .clearing-cell .puyo {
      animation: enhanced-chain-clear .48s cubic-bezier(.2,.72,.2,1) both !important;
      will-change: transform, opacity, filter, box-shadow;
    }
    .clearing-cell::before {
      content: '';
      position: absolute;
      left: 50%; top: 50%;
      width: 8px; height: 8px;
      border-radius: 50%;
      pointer-events: none;
      z-index: 2;
      transform: translate(-50%, -50%) scale(.25);
      box-shadow: 0 0 0 0 var(--clear-color), 0 0 0 0 rgba(255,255,255,0);
      animation: clear-flash-ring .48s ease-out both;
    }
    .clear-scatter-particle {
      position: absolute;
      left: 50%; top: 50%;
      width: var(--particle-size); height: var(--particle-size);
      border-radius: 50%;
      background: var(--clear-color);
      box-shadow: 0 0 5px rgba(255,255,255,.28);
      pointer-events: none;
      z-index: 4;
      opacity: 0;
      transform: translate(-50%, -50%) scale(.7);
      animation: clear-scatter .52s cubic-bezier(.13,.75,.25,1) var(--particle-delay) both;
    }
    @keyframes enhanced-chain-clear {
      0% { transform: scale(.94); opacity: 1; filter: brightness(1); }
      10% { transform: scale(1.12); opacity: 1; filter: brightness(1.8); }
      18% { transform: scale(.96); opacity: 1; filter: brightness(.7); }
      27% { transform: scale(1.08); opacity: 1; filter: brightness(1.75); }
      36% { transform: scale(1.02); opacity: .98; filter: brightness(.86); }
      58% { transform: scale(.82); opacity: .68; filter: brightness(1.35); }
      78% { transform: scale(.48); opacity: .26; filter: brightness(1.12); }
      100% { transform: scale(.08); opacity: 0; filter: brightness(1); }
    }
    @keyframes clear-flash-ring {
      0% { opacity: 0; transform: translate(-50%,-50%) scale(.25); box-shadow: 0 0 0 0 var(--clear-color), 0 0 0 0 rgba(255,255,255,0); }
      14% { opacity: .95; transform: translate(-50%,-50%) scale(.75); box-shadow: 0 0 0 5px var(--clear-color), 0 0 0 1px rgba(255,255,255,.8); }
      42% { opacity: .5; transform: translate(-50%,-50%) scale(1.6); box-shadow: 0 0 0 11px rgba(255,255,255,.18), 0 0 12px 2px rgba(255,255,255,.28); }
      100% { opacity: 0; transform: translate(-50%,-50%) scale(2.15); box-shadow: 0 0 0 17px transparent, 0 0 16px 2px transparent; }
    }
    @keyframes clear-scatter {
      0% { opacity: 0; transform: translate(-50%,-50%) translate(0,0) scale(.65); }
      14% { opacity: 1; transform: translate(-50%,-50%) translate(0,0) scale(1); }
      78% { opacity: .82; transform: translate(-50%,-50%) translate(var(--particle-x),var(--particle-y)) scale(.68); }
      100% { opacity: 0; transform: translate(-50%,-50%) translate(calc(var(--particle-x) * 1.16),calc(var(--particle-y) * 1.16)) scale(0); }
    }
  `
  document.head.appendChild(style)
}

function clearParticles(cell: HTMLElement): void {
  cell.querySelectorAll(':scope > .clear-scatter-particle').forEach((particle) => particle.remove())
}

function syncCell(cell: HTMLElement): void {
  clearParticles(cell)
  if (!cell.classList.contains('clearing-cell')) {
    cell.style.removeProperty('--clear-color')
    return
  }
  const puyo = cell.querySelector<HTMLElement>(':scope > .puyo')
  const color = puyo?.style.background || getComputedStyle(puyo ?? cell).backgroundColor || '#ffffff'
  cell.style.setProperty('--clear-color', color)
  PARTICLE_DIRECTIONS.forEach(([x, y], index) => {
    const particle = document.createElement('span')
    particle.className = 'clear-scatter-particle'
    particle.style.setProperty('--clear-color', color)
    particle.style.setProperty('--particle-x', x)
    particle.style.setProperty('--particle-y', y)
    particle.style.setProperty('--particle-size', `${3 + (index % 3)}px`)
    particle.style.setProperty('--particle-delay', `${(index % 4) * 0.012}s`)
    cell.appendChild(particle)
  })
}

function installBoard(board: HTMLElement): void {
  if (board.dataset.clearEffectsInstalled === '1') return
  board.dataset.clearEffectsInstalled = '1'
  board.querySelectorAll<HTMLElement>('.cell').forEach(syncCell)
  const observer = new MutationObserver((mutations) => {
    const cells = new Set<HTMLElement>()
    mutations.forEach((mutation) => {
      if (mutation.target instanceof HTMLElement && mutation.target.closest('.clear-scatter-particle')) return

      if (mutation.type === 'childList') {
        const changedParticlesOnly = [...mutation.addedNodes, ...mutation.removedNodes].every((node) =>
          node instanceof Element && node.classList.contains('clear-scatter-particle'),
        )
        if (changedParticlesOnly) return
      }

      const target = mutation.target instanceof HTMLElement ? mutation.target.closest<HTMLElement>('.cell') : null
      if (target) cells.add(target)

      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return
          if (node.classList.contains('clear-scatter-particle')) return
          const cell = node.closest<HTMLElement>('.cell')
          if (cell) cells.add(cell)
        })
      }
    })
    cells.forEach(syncCell)
  })
  observer.observe(board, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] })
}

function scan(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('.board').forEach(installBoard)
}

installStyles()
scan()
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
    if (!(node instanceof Element)) return
    if (node.matches('.board')) installBoard(node as HTMLElement)
    scan(node)
  }))
})
observer.observe(document.body, { childList: true, subtree: true })
