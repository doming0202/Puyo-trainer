import { readFileSync, writeFileSync } from 'node:fs'

const path = 'src/App.tsx'
let text = readFileSync(path, 'utf8')
const bridge = `  useEffect(() => {\n    const onPlayerState = (event: Event) => {\n      const state = (event as CustomEvent<RoomPlayerStateSync>).detail\n      if (!state || (state.playerIndex !== 0 && state.playerIndex !== 1)) return\n      applyRemoteRoomPlayerState(state)\n    }\n    window.addEventListener('puyo-room-player-state', onPlayerState)\n    return () => window.removeEventListener('puyo-room-player-state', onPlayerState)\n  }, [applyRemoteRoomPlayerState])\n\n`
const first = text.indexOf(bridge)
if (first < 0) throw new Error('player-state bridge not found')
text = text.slice(0, first) + text.slice(first + bridge.length)
const target = "  }, [resetClock])\n\n  useEffect(() => {\n    const onTimelineSeek = (event: Event) => {\n"
const idx = text.indexOf(target)
if (idx < 0) throw new Error('remote live-state anchor not found')
const insertAt = idx + "  }, [resetClock])\n\n".length
text = text.slice(0, insertAt) + bridge + text.slice(insertAt)
writeFileSync(path, text, 'utf8')
console.log('moved player-state bridge below its callback definition')
