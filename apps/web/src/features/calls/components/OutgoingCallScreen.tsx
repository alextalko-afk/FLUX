import { useState } from 'react';
import { useI18n } from '../../../hooks/useI18n';
import { Avatar } from '../../../components/ui/Avatar';
import { webrtcService } from '../services/webrtc.service';
import { CALL_ICON, CallIcon, CallRoundButton, HangupIcon } from './CallControls';

interface OutgoingCallScreenProps {
  peerName: string;
  peerAvatar: string | null;
  callType: 'AUDIO' | 'VIDEO';
  onCancel: () => void;
}

/** Shown to the caller while ringing: the person, what is happening, and the controls that already work. */
export function OutgoingCallScreen({ peerName, peerAvatar, callType, onCancel }: OutgoingCallScreenProps) {
  const { t } = useI18n();
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);

  const toggleMute = () => {
    webrtcService.toggleAudio(muted);
    setMuted(!muted);
  };
  const toggleVideo = () => {
    webrtcService.toggleVideo(videoOff);
    setVideoOff(!videoOff);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center animate-fade-in bg-bg-app"
      style={{ background: 'radial-gradient(50% 45% at 50% 32%, rgb(var(--color-fg-accent) / 0.32), transparent 70%), rgb(var(--color-bg-app))' }}
    >
      <div className="flex flex-col items-center text-center animate-float-up px-6">
        <div className="relative">
          {/* Pulsing rings make it obvious the call is live, not frozen. */}
          <span className="absolute inset-0 rounded-full bg-fg-accent/20 animate-pulse-ring" />
          <span className="absolute inset-0 rounded-full bg-fg-accent/20 animate-pulse-ring" style={{ animationDelay: '0.6s' }} />
          <div
            className="relative w-28 h-28 rounded-full overflow-hidden"
            style={{ boxShadow: '0 0 0 10px rgb(var(--color-fg-accent) / 0.14), 0 0 0 22px rgb(var(--color-fg-accent) / 0.07)' }}
          >
            <Avatar name={peerName} avatarUrl={peerAvatar} size="xl" circleClassName="w-28 h-28 text-4xl" />
          </div>
        </div>

        <h2 className="mt-10 text-[22px] font-semibold text-fg-primary">{peerName}</h2>
        <p className="mt-2 text-sm text-fg-secondary flex items-center justify-center gap-1.5">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="ml-1.5">
            {t('calls.connecting')} {t(`calls.${callType === 'VIDEO' ? 'video' : 'audio'}`)}
          </span>
        </p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-fg-success">
          <CallIcon path={CALL_ICON.lock} className="w-4 h-4" />
          {t('calls.encrypted')}
        </p>

        <div className="mt-10 flex items-center justify-center gap-4">
          <CallRoundButton active={muted} label={muted ? t('calls.unmute') : t('calls.mute')} onClick={toggleMute}>
            <CallIcon path={muted ? CALL_ICON.micOff : CALL_ICON.mic} />
          </CallRoundButton>
          {callType === 'VIDEO' && (
            <CallRoundButton active={videoOff} label={videoOff ? t('calls.videoOn') : t('calls.videoOff')} onClick={toggleVideo}>
              <CallIcon path={videoOff ? CALL_ICON.videoOff : CALL_ICON.video} />
            </CallRoundButton>
          )}
          <CallRoundButton end label={t('calls.declineCall')} onClick={onCancel}>
            <HangupIcon />
          </CallRoundButton>
        </div>
      </div>
    </div>
  );
}
