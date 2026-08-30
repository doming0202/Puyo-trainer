import { useEffect, useMemo, useRef, useState } from 'react'
import { findFrameAtElapsed, type ReplayState } from '../game/replay'
import { gameForPersistence, replayForSharing } from '../game/state-boundary'
import type { GameState } from '../game/types'
import type { RoomAction, RoomPlayerState, RoomPlayerStateSync, RoomTimeStateSync, SharedRoomLiveState, SharedRoomState, RoomRole, RoomFocusState } from '../game/room-client'
import { getRoomInviteFromUrl, getStoredRoomSession, RoomClient } from '../game/room-client'
import './RoomPanel.css'

const MAX_SHARED_FRAMES = 2500
const LIVE_INTERVAL_MS = 50
const SNAPSHOT_INTERVAL_MS = 5000

type FocusRequestDetail = { playerIndex: 0 | 1 }

function compactGame(game: GameState): GameState { return gameForPersistence(game) }

function compactReplay(replay: ReplayState): ReplayState {
  const normalized = replayForSharing(replay)
  const source = normalized.frames
  const stride = Math.max(1, Math.ceil(source.length / MAX_SHARED_FRAMES))
  const frames = source.filter((_, index) => index % stride === 0 || index === source.length - 1)
  const activeElapsed = source[replay.cursor]?.elapsedMs ?? 0
  const cursor = findFrameAtElapsed(frames, activeElapsed)
  return { frames, cursor, playing: replay.playing, speed: replay.speed }
}

function compactPlayerState(player: GameState['players'][number]): RoomPlayerState {
  const { turnStart: _turnStart, undoStack: _undoStack, redoStack: _redoStack, puyoSequence: _puyoSequence, ...state } = player
  return structuredClone(state)
}

function compactTimeState(player: GameState['players'][number]): RoomTimeStateSync['player'] {
  return {
    current: player.current,
    next: player.next,
    paused: player.paused,
    alive: player.alive,
    resolution: player.resolution,
    fallElapsedMs: player.fallElapsedMs,
    lockElapsedMs: player.lockElapsedMs,
    quickTurnArmed: player.quickTurnArmed,
    score: player.score,
    chain: player.chain,
    incomingGarbage: player.incomingGarbage,
    garbage: player.garbage,
    puyoSequenceIndex: player.puyoSequenceIndex,
    puyoSequenceSeed: player.puyoSequenceSeed,
  }
}

function dispatchFocusState(focus: RoomFocusState | null, memberId: string | null, connected: boolean): void {
  window.dispatchEvent(new CustomEvent('puyo-room-focus-state', { detail: { focus, memberId, connected } }))
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    if (!document.execCommand('copy')) throw new Error('copy-failed')
  } finally { textarea.remove() }
}

export function RoomPanel({ open, onClose, game, replay, currentTimelineMs, onRemoteState, onRemoteLiveState }: {
  open: boolean
  onClose: () => void
  game: GameState
  replay: ReplayState
  currentTimelineMs: number
  onRemoteState: (state: SharedRoomState) => void
  onRemoteLiveState: (state: SharedRoomLiveState) => void
}) {
  const clientRef = useRef<RoomClient | null>(null)
  const gameRef = useRef(game)
  const replayRef = useRef(replay)
  const timelineRef = useRef(currentTimelineMs)
  const followCoachRef = useRef(true)
  const autoJoinRef = useRef('')
  const lastSnapshotSyncRef = useRef(0)
  const [role, setRole] = useState<RoomRole | null>(null)
  const [roomId, setRoomId] = useState('')
  const [joinToken, setJoinToken] = useState('')
  const [studentCount, setStudentCount] = useState(0)
  const [status, setStatus] = useState('未接続')
  const [error, setError] = useState('')
  const [followCoach, setFollowCoach] = useState(true)
  const [invite, setInvite] = useState(() => getRoomInviteFromUrl())
  const [storedRoom, setStoredRoom] = useState(() => getStoredRoomSession())

  gameRef.current = game
  replayRef.current = replay
  timelineRef.current = currentTimelineMs
  followCoachRef.current = followCoach

  useEffect(() => {
    const client = new RoomClient()
    clientRef.current = client
    const unsubscribe = client.subscribe(message => {
      if (message.type === 'room-created') {
        setRole(message.role); setRoomId(message.roomId); setJoinToken(message.joinToken); setStoredRoom(getStoredRoomSession()); setStatus('コーチとして接続中'); setError(''); dispatchFocusState(message.focus, message.memberId, true)
      } else if (message.type === 'room-joined') {
        setRole(message.role); setRoomId(message.roomId); setStoredRoom(getStoredRoomSession()); setStatus(message.role === 'coach' ? 'コーチとして接続中' : '生徒として接続中'); setStudentCount(message.studentCount); setError(''); dispatchFocusState(message.focus, message.memberId, true)
        if (message.state && message.role === 'student') onRemoteState(message.state)
        if (message.liveState && message.role === 'student') onRemoteLiveState(message.liveState)
        if (message.role === 'student' && window.location.hash) { const url = new URL(window.location.href); url.hash = ''; window.history.replaceState(null, '', url.toString()); setInvite(null) }
      } else if (message.type === 'presence') {
        setStudentCount(message.studentCount)
      } else if (message.type === 'state') {
        if (message.state && client.role === 'student') onRemoteState(message.state)
      } else if (message.type === 'live-state') {
        if (message.state && client.role === 'student' && followCoachRef.current) onRemoteLiveState(message.state)
      } else if (message.type === 'player-state') {
        window.dispatchEvent(new CustomEvent('puyo-room-player-state', { detail: message.state }))
      } else if (message.type === 'time-state') {
        window.dispatchEvent(new CustomEvent('puyo-room-time-state', { detail: message.state }))
      } else if (message.type === 'reset-state') {
        window.dispatchEvent(new CustomEvent('puyo-room-reset-state', { detail: message.state }))
      } else if (message.type === 'focus-state') {
        dispatchFocusState(message.focus, client.memberId || null, true)
      } else if (message.type === 'focus-granted') {
        dispatchFocusState(message.focus, client.memberId || null, true)
        window.dispatchEvent(new CustomEvent('puyo-room-focus-granted', { detail: { playerIndex: message.playerIndex } }))
      } else if (message.type === 'student-action') {
        window.dispatchEvent(new CustomEvent('puyo-room-student-action', { detail: { playerIndex: message.playerIndex, action: message.action } }))
      } else if (message.type === 'focus-denied') {
        window.dispatchEvent(new CustomEvent('puyo-room-focus-denied', { detail: { playerIndex: message.playerIndex, reason: message.reason, ownerRole: message.ownerRole ?? null } }))
      } else if (message.type === 'disconnected') {
        setRole(null); setStudentCount(0); setStatus('接続が切れました'); setStoredRoom(getStoredRoomSession()); dispatchFocusState(null, null, false)
      } else if (message.type === 'error') {
        setStatus('接続エラー'); setError(message.message)
      }
    })

    const onFocusRequest = (event: Event) => { const detail = (event as CustomEvent<FocusRequestDetail>).detail; if (!detail || (detail.playerIndex !== 0 && detail.playerIndex !== 1)) return; void client.requestFocus(detail.playerIndex) }
    const onFocusRelease = (event: Event) => { const detail = (event as CustomEvent<FocusRequestDetail>).detail; if (!detail || (detail.playerIndex !== 0 && detail.playerIndex !== 1)) return; client.releaseFocus(detail.playerIndex) }
    const onLocalAction = (event: Event) => {
      const detail = (event as CustomEvent<{ playerIndex: 0 | 1; action: RoomAction }>).detail
      if (!detail || (detail.playerIndex !== 0 && detail.playerIndex !== 1) || typeof detail.action !== 'string') return
      if (!client.role) return
      if (detail.action !== 'global-pause' && client.focus[detail.playerIndex] !== client.memberId) return
      client.sendAction(detail.playerIndex, detail.action)
    }
    const onLocalReset = () => {
      if (!client.role) return
      const state: SharedRoomState = { game: compactGame(gameRef.current), replay: compactReplay(replayRef.current), elapsedMs: timelineRef.current }
      client.sendResetState(state)
    }
    window.addEventListener('puyo-room-request-focus', onFocusRequest)
    window.addEventListener('puyo-room-release-focus', onFocusRelease)
    window.addEventListener('puyo-room-local-action', onLocalAction)
    window.addEventListener('puyo-room-reset', onLocalReset)
    return () => {
      window.removeEventListener('puyo-room-request-focus', onFocusRequest)
      window.removeEventListener('puyo-room-release-focus', onFocusRelease)
      window.removeEventListener('puyo-room-local-action', onLocalAction)
      window.removeEventListener('puyo-room-reset', onLocalReset)
      unsubscribe(); client.disconnect(); clientRef.current = null; dispatchFocusState(null, null, false)
    }
  }, [onRemoteLiveState, onRemoteState])

  useEffect(() => { setInvite(getRoomInviteFromUrl()); setStoredRoom(getStoredRoomSession()) }, [open])

  useEffect(() => {
    if (!open || role !== 'coach') return
    clientRef.current?.sendState({ game: compactGame(gameRef.current), replay: compactReplay(replayRef.current), elapsedMs: timelineRef.current })
    lastSnapshotSyncRef.current = Date.now()
    setStatus('コーチとして接続中')
  }, [open, role])

  useEffect(() => {
    if (!open || !role) return
    const timer = window.setInterval(() => {
      const client = clientRef.current
      if (!client || !client.memberId) return
      const current = gameRef.current
      const elapsedMs = Math.max(0, timelineRef.current)
      for (const playerIndex of [0, 1] as const) {
        if (client.focus[playerIndex] !== client.memberId) continue
        client.sendTimeState({
          playerIndex,
          player: compactTimeState(current.players[playerIndex]),
          tick: current.tick,
          activePlayer: current.activePlayer,
          running: current.running,
          elapsedMs,
        })
      }
      if (role === 'coach' && !current.running && Date.now() - lastSnapshotSyncRef.current >= SNAPSHOT_INTERVAL_MS) {
        client.sendState({ game: compactGame(current), replay: compactReplay(replayRef.current), elapsedMs })
        lastSnapshotSyncRef.current = Date.now()
      }
      if (role === 'coach' && replayRef.current.playing) {
        const currentReplay = replayRef.current
        client.sendLiveState({ elapsedMs, cursorElapsedMs: currentReplay.frames[currentReplay.cursor]?.elapsedMs ?? elapsedMs, playing: true, speed: currentReplay.speed })
      }
    }, LIVE_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [open, role])

  const inviteUrl = useMemo(() => roomId && joinToken ? RoomClient.inviteUrl(roomId, joinToken) : '', [roomId, joinToken])
  const hasInvite = Boolean(invite?.roomId && invite?.joinToken)
  const createRoom = async () => { setError(''); setStatus('ルーム作成中…'); try { await clientRef.current?.createRoom() } catch (caught) { setStatus('接続エラー'); setError(caught instanceof Error ? caught.message : 'ルームを作成できませんでした') } }
  const joinRoom = async () => { if (!invite) return; setError(''); setStatus('ルーム参加中…'); try { await clientRef.current?.join(invite.roomId, invite.joinToken) } catch (caught) { setStatus('接続エラー'); setError(caught instanceof Error ? caught.message : 'ルームに参加できませんでした') } }
  const rejoinStoredRoom = async () => { setError(''); setStatus('前回のルームへ再接続中…'); try { const rejoined = await clientRef.current?.rejoinStoredRoom(); if (!rejoined) throw new Error('no-session') } catch (caught) { setStatus('接続エラー'); setError(caught instanceof Error && caught.message !== 'no-session' ? caught.message : '保存済みルームへ再接続できませんでした') } }
  useEffect(() => { if (!open || role || !invite) return; const key = `${invite.roomId}:${invite.joinToken}`; if (autoJoinRef.current === key) return; autoJoinRef.current = key; void joinRoom() }, [open, role, invite])
  const copyInvite = async () => { if (!inviteUrl) return; try { await copyText(inviteUrl); setStatus('招待リンクをコピーしました') } catch { setError('クリップボードへコピーできませんでした') } }
  const leaveRoom = () => { clientRef.current?.disconnect(); clientRef.current?.forgetStoredRoom(); setRole(null); setRoomId(''); setJoinToken(''); setStudentCount(0); setStoredRoom(null); setStatus('未接続'); setError(''); dispatchFocusState(null, null, false) }
  if (!open) return null

  return <div className="room-panel-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="room-panel" role="dialog" aria-modal="true" aria-labelledby="room-panel-title" onMouseDown={event => event.stopPropagation()}>
      <div className="room-panel-header"><div><div className="aside-label">COACHING ROOM</div><h3 id="room-panel-title">ROOM</h3><p>コーチの局面・Replay・Timelineを共有します。</p></div><button type="button" className="room-close" onClick={onClose} aria-label="ルームを閉じる">×</button></div>
      <div className="room-status-row"><span className={`room-status room-status-${role || 'offline'}`}>{role === 'coach' ? 'COACH' : role === 'student' ? 'STUDENT' : 'OFFLINE'}</span><span>{status}</span>{role === 'coach' && <span>生徒 {studentCount} 人</span>}</div>
      {!role && <div className="room-actions">{hasInvite && <button type="button" onClick={()=>void joinRoom()}>招待ルームに参加</button>}{storedRoom && <button type="button" onClick={()=>void rejoinStoredRoom()}>前回のルームに再接続</button>}<button type="button" onClick={()=>void createRoom()}>ルームを作成</button></div>}
      {role === 'coach' && <div className="room-section"><strong>招待</strong><p>URLは画面に表示しません。コピーしてDiscordへ貼り付けてください。</p><button type="button" className="room-primary-action" onClick={()=>void copyInvite()}>招待リンクをコピー</button></div>}
      {role === 'student' && <div className="room-section"><strong>コーチ追従</strong><label className="room-follow-toggle"><input type="checkbox" checked={followCoach} onChange={event=>setFollowCoach(event.target.checked)} /><span>コーチの局面・Timelineに追従する</span></label><p>OFFにすると、この端末で自分の操作・検討を続けられます。</p></div>}
      {role && <div className="room-footer-actions"><button type="button" onClick={leaveRoom}>ルームから退出</button></div>}
      {error && <div className="room-error" role="alert">{error}</div>}
      <small className="room-note">招待リンクを知っている人だけが参加できます。ルームはサーバー上に一時保存され、24時間操作がないと破棄されます。</small>
    </section>
  </div>
}
