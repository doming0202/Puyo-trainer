import { useEffect, useMemo, useRef, useState } from 'react'
import { findFrameAtElapsed, type ReplayState } from '../game/replay'
import type { GameState, PlayerState, TurnState } from '../game/types'
import { getRoomInviteFromUrl, RoomClient, type SharedRoomLiveState, type SharedRoomState, type RoomRole } from '../game/room-client'
import './RoomPanel.css'

const MAX_SHARED_FRAMES = 2500
const LIVE_INTERVAL_MS = 150

function compactTurnState(state: TurnState): TurnState {
  return structuredClone(state)
}

function compactPlayer(player: PlayerState): PlayerState {
  return {
    ...structuredClone(player),
    turnStart: compactTurnState(player.turnStart),
    undoStack: [],
    redoStack: [],
  }
}

function compactGame(game: GameState): GameState {
  return {
    ...game,
    players: [compactPlayer(game.players[0]), compactPlayer(game.players[1])],
  }
}

function compactReplay(replay: ReplayState): ReplayState {
  const source = replay.frames
  const stride = Math.max(1, Math.ceil(source.length / MAX_SHARED_FRAMES))
  const frames = source.filter((_, index) => index % stride === 0 || index === source.length - 1).map(frame => ({
    ...frame,
    players: [compactPlayer(frame.players[0]), compactPlayer(frame.players[1])],
  }))
  const activeElapsed = source[replay.cursor]?.elapsedMs ?? 0
  const cursor = findFrameAtElapsed(frames, activeElapsed)
  return { frames, cursor, playing: replay.playing, speed: replay.speed }
}

export function RoomPanel({
  open,
  onClose,
  game,
  replay,
  currentTimelineMs,
  onRemoteState,
  onRemoteLiveState,
}: {
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
  const [role, setRole] = useState<RoomRole | null>(null)
  const [roomId, setRoomId] = useState('')
  const [joinToken, setJoinToken] = useState('')
  const [studentCount, setStudentCount] = useState(0)
  const [status, setStatus] = useState('未接続')
  const [error, setError] = useState('')
  const [followCoach, setFollowCoach] = useState(true)
  const [invite, setInvite] = useState(() => getRoomInviteFromUrl())

  gameRef.current = game
  replayRef.current = replay
  timelineRef.current = currentTimelineMs
  followCoachRef.current = followCoach

  useEffect(() => {
    const client = new RoomClient()
    clientRef.current = client
    const unsubscribe = client.subscribe(message => {
      if (message.type === 'room-created') {
        setRole(message.role)
        setRoomId(message.roomId)
        setJoinToken(message.joinToken)
        setStatus('コーチとして接続中')
        setError('')
      } else if (message.type === 'room-joined') {
        setRole(message.role)
        setRoomId(message.roomId)
        setStatus(message.role === 'coach' ? 'コーチとして接続中' : '生徒として接続中')
        setStudentCount(message.studentCount)
        setError('')
        if (message.state && message.role === 'student') onRemoteState(message.state)
        if (message.role === 'student' && window.location.hash) {
          const url = new URL(window.location.href)
          url.hash = ''
          window.history.replaceState(null, '', url.toString())
          setInvite(null)
        }
      } else if (message.type === 'presence') {
        setStudentCount(message.studentCount)
      } else if (message.type === 'state') {
        if (message.state && client.role === 'student') onRemoteState(message.state)
      } else if (message.type === 'live-state') {
        if (message.state && client.role === 'student' && followCoachRef.current) onRemoteLiveState(message.state)
      } else if (message.type === 'error') {
        setStatus('接続エラー')
        setError(message.message)
      }
    })
    return () => {
      unsubscribe()
      client.disconnect()
      clientRef.current = null
    }
  }, [onRemoteLiveState, onRemoteState])

  useEffect(() => {
    setInvite(getRoomInviteFromUrl())
  }, [open])

  useEffect(() => {
    if (!open || !role || role !== 'coach') return
    clientRef.current?.sendState({
      game: compactGame(gameRef.current),
      replay: compactReplay(replayRef.current),
      elapsedMs: timelineRef.current,
    })
    setStatus('コーチとして接続中')
  }, [open, role])

  useEffect(() => {
    if (!open || role !== 'coach') return
    const timer = window.setInterval(() => {
      const client = clientRef.current
      if (!client || client.role !== 'coach') return
      const currentReplay = replayRef.current
      const currentElapsed = Math.max(0, timelineRef.current)
      const lastElapsed = currentReplay.frames[currentReplay.frames.length - 1]?.elapsedMs ?? 0
      if (currentElapsed + 80 < lastElapsed || gameRef.current.tick === 0) {
        client.sendState({
          game: compactGame(gameRef.current),
          replay: compactReplay(currentReplay),
          elapsedMs: currentElapsed,
        })
      }
      client.sendLiveState({
        game: compactGame(gameRef.current),
        elapsedMs: currentElapsed,
        cursorElapsedMs: currentReplay.frames[currentReplay.cursor]?.elapsedMs ?? currentElapsed,
        playing: currentReplay.playing,
        speed: currentReplay.speed,
      })
    }, LIVE_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [open, role])

  const inviteUrl = useMemo(() => roomId && joinToken ? RoomClient.inviteUrl(roomId, joinToken) : '', [roomId, joinToken])
  const hasInvite = Boolean(invite?.roomId && invite?.joinToken)

  const createRoom = async () => {
    setError('')
    setStatus('ルーム作成中…')
    try { await clientRef.current?.createRoom() } catch (caught) { setStatus('接続エラー'); setError(caught instanceof Error ? caught.message : 'ルームを作成できませんでした') }
  }

  const joinRoom = async () => {
    if (!invite) return
    setError('')
    setStatus('ルーム参加中…')
    try { await clientRef.current?.join(invite.roomId, invite.joinToken) } catch (caught) { setStatus('接続エラー'); setError(caught instanceof Error ? caught.message : 'ルームに参加できませんでした') }
  }

  useEffect(() => {
    if (!open || role || !invite) return
    const key = `${invite.roomId}:${invite.joinToken}`
    if (autoJoinRef.current === key) return
    autoJoinRef.current = key
    void joinRoom()
  }, [open, role, invite])

  const copyInvite = async () => {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setStatus('招待リンクをコピーしました')
    } catch {
      setError('クリップボードへコピーできませんでした')
    }
  }

  const leaveRoom = () => {
    clientRef.current?.disconnect()
    setRole(null)
    setRoomId('')
    setJoinToken('')
    setStudentCount(0)
    setStatus('未接続')
    setError('')
  }

  if (!open) return null

  return <div className="room-panel-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="room-panel" role="dialog" aria-modal="true" aria-labelledby="room-panel-title" onMouseDown={event => event.stopPropagation()}>
      <div className="room-panel-header">
        <div>
          <div className="aside-label">COACHING ROOM</div>
          <h3 id="room-panel-title">ROOM</h3>
          <p>コーチの局面・Replay・Timelineを共有します。</p>
        </div>
        <button type="button" className="room-close" onClick={onClose} aria-label="ルームを閉じる">×</button>
      </div>

      <div className="room-status-row">
        <span className={`room-status room-status-${role || 'offline'}`}>{role === 'coach' ? 'COACH' : role === 'student' ? 'STUDENT' : 'OFFLINE'}</span>
        <span>{status}</span>
        {role === 'coach' && <span>生徒 {studentCount} 人</span>}
      </div>

      {!role && <div className="room-actions">
        {hasInvite && <button type="button" onClick={()=>void joinRoom()}>招待ルームに参加</button>}
        <button type="button" onClick={()=>void createRoom()}>ルームを作成</button>
      </div>}

      {role === 'coach' && <div className="room-section">
        <strong>招待</strong>
        <p>URLは画面に表示しません。コピーしてDiscordへ貼り付けてください。</p>
        <button type="button" className="room-primary-action" onClick={()=>void copyInvite()}>招待リンクをコピー</button>
      </div>}

      {role === 'student' && <div className="room-section">
        <strong>コーチ追従</strong>
        <label className="room-follow-toggle"><input type="checkbox" checked={followCoach} onChange={event=>setFollowCoach(event.target.checked)} /><span>コーチの局面・Timelineに追従する</span></label>
        <p>OFFにすると、この端末で自分の操作・検討を続けられます。</p>
      </div>}

      {role && <div className="room-footer-actions"><button type="button" onClick={leaveRoom}>ルームから退出</button></div>}
      {error && <div className="room-error" role="alert">{error}</div>}
      <small className="room-note">招待リンクを知っている人だけが参加できます。ルームはサーバー上に一時保存され、24時間操作がないと破棄されます。</small>
    </section>
  </div>
}
