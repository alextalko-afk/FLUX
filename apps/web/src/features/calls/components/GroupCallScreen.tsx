import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectionState, Participant, ParticipantEvent, Room, RoomEvent, Track } from 'livekit-client';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useI18n } from '../../../hooks/useI18n';
import { useAuthStore } from '../../../stores/auth.store';
import { GroupCallSession, useGroupCallStore } from '../../../stores/groupCall.store';
import { CALL_ICON, CallIcon, CallRoundButton, HangupIcon } from './CallControls';

const initials = (name: string) => name.trim().slice(0, 2).toUpperCase();

/** Re-renders when a participant's tracks, mute state or speaking state change. */
function useParticipantUpdates(participant: Participant) {
  const [, bump] = useState(0);
  useEffect(() => {
    const rerender = () => bump((n) => n + 1);
    const events = [
      ParticipantEvent.TrackSubscribed,
      ParticipantEvent.TrackUnsubscribed,
      ParticipantEvent.TrackMuted,
      ParticipantEvent.TrackUnmuted,
      ParticipantEvent.LocalTrackPublished,
      ParticipantEvent.LocalTrackUnpublished,
      ParticipantEvent.IsSpeakingChanged,
    ] as const;
    events.forEach((e) => participant.on(e, rerender));
    return () => {
      events.forEach((e) => participant.off(e, rerender));
    };
  }, [participant]);
}

/** One participant: their camera (or screen) and, for remote ones, their audio. */
function Tile({ participant, deafened }: { participant: Participant; deafened: boolean }) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioHost = useRef<HTMLDivElement>(null);
  useParticipantUpdates(participant);

  const screen = participant.getTrackPublication(Track.Source.ScreenShare)?.track;
  const camera = participant.getTrackPublication(Track.Source.Camera)?.track;
  const video = screen ?? camera;
  const mic = participant.getTrackPublication(Track.Source.Microphone);
  const micOff = !mic?.track || mic.isMuted;

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !video) return;
    video.attach(el);
    return () => {
      video.detach(el);
    };
  }, [video]);

  useEffect(() => {
    if (participant.isLocal || !mic?.track || !audioHost.current) return;
    const el = mic.track.attach();
    audioHost.current.appendChild(el);
    return () => {
      mic.track?.detach(el);
      el.remove();
    };
  }, [participant.isLocal, mic?.track]);

  // "Sound off" silences everybody else without touching your own microphone.
  useEffect(() => {
    audioHost.current?.querySelectorAll('audio').forEach((el) => {
      el.muted = deafened;
    });
  });

  const name = participant.name || participant.identity;
  return (
    <div
      className={clsx(
        'relative aspect-video rounded-2xl overflow-hidden bg-bg-elevated flex items-center justify-center transition-shadow',
        participant.isSpeaking ? 'ring-2 ring-fg-accent shadow-accent' : 'ring-1 ring-border',
      )}
    >
      {video ? (
        <video ref={videoRef} autoPlay playsInline muted={participant.isLocal} className="w-full h-full object-cover" />
      ) : (
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#8f80ff] to-[#5a4de0] text-white text-xl font-semibold flex items-center justify-center">
          {initials(name)}
        </div>
      )}
      <div ref={audioHost} className="hidden" />
      <div className="absolute left-2.5 bottom-2.5 max-w-[85%] px-2.5 py-1 rounded-full bg-black/60 text-white text-xs flex items-center gap-1.5">
        {micOff && <CallIcon path={CALL_ICON.micOff} className="w-3.5 h-3.5 text-fg-error flex-shrink-0" />}
        <span className="truncate">
          {name}
          {participant.isLocal ? ` (${t('groupCall.you')})` : ''}
        </span>
      </div>
    </div>
  );
}

/** One line of the participants list. */
function MemberRow({ participant }: { participant: Participant }) {
  const { t } = useI18n();
  useParticipantUpdates(participant);
  const mic = participant.getTrackPublication(Track.Source.Microphone);
  const off = !mic?.track || mic.isMuted;
  const name = participant.name || participant.identity;
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-bg-hover">
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#8f80ff] to-[#5a4de0] text-white text-xs font-semibold flex items-center justify-center">{initials(name)}</div>
      <div className="min-w-0 flex-1 text-sm text-fg-primary truncate">
        {name}
        {participant.isLocal ? ` (${t('groupCall.you')})` : ''}
      </div>
      <CallIcon path={off ? CALL_ICON.micOff : CALL_ICON.mic} className={clsx('w-4 h-4', off ? 'text-fg-error' : 'text-fg-success')} />
    </div>
  );
}

const formatDuration = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

/** The full-screen call: connects to the SFU and shows everyone in a grid. */
export function GroupCallScreen({ session }: { session: GroupCallSession }) {
  const { t } = useI18n();
  // The connect effect must not re-run (and drop the call) when the language changes.
  const tRef = useRef(t);
  tRef.current = t;
  const myId = useAuthStore((s) => s.user?.id);
  const leave = useGroupCallStore((s) => s.leave);
  const end = useGroupCallStore((s) => s.end);
  const call = useGroupCallStore((s) => s.byChat[session.chatId]);
  const roomRef = useRef<Room | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [status, setStatus] = useState<'connecting' | 'live' | 'failed'>('connecting');
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(session.withVideo);
  const [sharing, setSharing] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const refresh = useCallback(() => {
    const room = roomRef.current;
    if (room) setParticipants([room.localParticipant, ...Array.from(room.remoteParticipants.values())]);
  }, []);

  useEffect(() => {
    if (status !== 'live') return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    let cancelled = false;

    room
      .on(RoomEvent.ParticipantConnected, refresh)
      .on(RoomEvent.ParticipantDisconnected, refresh)
      .on(RoomEvent.Disconnected, () => !cancelled && setStatus('failed'));

    (async () => {
      try {
        await room.connect(session.url, session.token);
        if (cancelled) return room.disconnect();
        // No microphone (denied, missing) must not cost the person the call: they join and can listen.
        await room.localParticipant.setMicrophoneEnabled(true).catch(() => {
          setMic(false);
          toast.error(tRef.current('groupCall.noMic'));
        });
        if (session.withVideo) await room.localParticipant.setCameraEnabled(true).catch(() => setCam(false));
        setStatus(room.state === ConnectionState.Connected ? 'live' : 'failed');
        refresh();
      } catch {
        if (!cancelled) setStatus('failed');
      }
    })();

    return () => {
      cancelled = true;
      room.disconnect();
      roomRef.current = null;
    };
  }, [session, refresh]);

  const toggle = async (kind: 'mic' | 'cam' | 'screen') => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    try {
      if (kind === 'mic') setMic(await lp.setMicrophoneEnabled(!mic).then(() => !mic));
      if (kind === 'cam') setCam(await lp.setCameraEnabled(!cam).then(() => !cam));
      if (kind === 'screen') setSharing(await lp.setScreenShareEnabled(!sharing).then(() => !sharing));
      refresh();
    } catch {
      toast.error(t('groupCall.deviceFailed'));
    }
  };

  const canEnd = call?.startedById === myId;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col text-fg-primary"
      style={{ background: 'radial-gradient(50% 40% at 50% 0%, rgb(var(--color-fg-accent) / 0.22), transparent 70%), rgb(var(--color-bg-app))' }}
      data-testid="group-call-screen"
    >
      <div className="px-5 py-4 flex items-center justify-between">
        <div>
          <div className="font-semibold text-lg">{t('groupCall.title')}</div>
          <div className="text-xs text-fg-secondary mt-0.5 tabular-nums">
            {status === 'connecting'
              ? t('groupCall.connecting')
              : status === 'failed'
                ? t('groupCall.failed')
                : `${formatDuration(seconds)} · ${t('groupCall.participants', { count: String(participants.length) })}`}
          </div>
        </div>
        {canEnd && (
          <button onClick={() => void end()} className="text-sm text-fg-secondary hover:text-fg-error transition-colors">
            {t('groupCall.endAll')}
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 overflow-y-auto p-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,440px))] justify-center content-center">
          {participants.map((p) => (
            <Tile key={p.sid || p.identity} participant={p} deafened={deafened} />
          ))}
        </div>
        {showMembers && (
          <aside className="w-72 flex-shrink-0 border-l border-border-subtle bg-bg-panel/80 overflow-y-auto p-3 animate-fade-in" aria-label={t('groupCall.members')}>
            <h3 className="px-3 pb-2 text-xs font-bold uppercase tracking-[0.12em] text-fg-secondary">
              {t('groupCall.members')} · {participants.length}
            </h3>
            {participants.map((p) => (
              <MemberRow key={p.sid || p.identity} participant={p} />
            ))}
          </aside>
        )}
      </div>

      <div className="p-6 pb-8 flex items-center justify-center gap-4 flex-wrap">
        <CallRoundButton active={!mic} label={mic ? t('groupCall.mute') : t('groupCall.unmute')} onClick={() => void toggle('mic')}>
          <CallIcon path={mic ? CALL_ICON.mic : CALL_ICON.micOff} />
        </CallRoundButton>
        <CallRoundButton active={cam} label={cam ? t('groupCall.cameraOff') : t('groupCall.cameraOn')} onClick={() => void toggle('cam')}>
          <CallIcon path={cam ? CALL_ICON.video : CALL_ICON.videoOff} />
        </CallRoundButton>
        <CallRoundButton active={sharing} label={sharing ? t('groupCall.stopShare') : t('groupCall.share')} onClick={() => void toggle('screen')}>
          <CallIcon path={CALL_ICON.screen} />
        </CallRoundButton>
        <CallRoundButton active={deafened} label={deafened ? t('groupCall.speakerOn') : t('groupCall.speakerOff')} onClick={() => setDeafened((v) => !v)}>
          <CallIcon path={deafened ? CALL_ICON.speakerOff : CALL_ICON.speaker} />
        </CallRoundButton>
        <CallRoundButton active={showMembers} label={t('groupCall.members')} onClick={() => setShowMembers((v) => !v)}>
          <CallIcon path={CALL_ICON.users} />
        </CallRoundButton>
        <CallRoundButton end label={t('groupCall.leave')} onClick={() => void leave()}>
          <HangupIcon />
        </CallRoundButton>
      </div>
    </div>
  );
}
