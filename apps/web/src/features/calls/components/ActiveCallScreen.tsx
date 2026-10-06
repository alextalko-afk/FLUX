import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useCallsStore } from '../../../stores/calls.store';
import { webrtcService } from '../services/webrtc.service';
import { CallRoundButton } from './CallControls';
import { useI18n } from '../../../hooks/useI18n';

interface ActiveCallScreenProps {
  peerName: string;
  peerAvatar?: string | null;
  onEnd: () => void;
}

export function ActiveCallScreen({ peerName, peerAvatar, onEnd }: ActiveCallScreenProps) {
  const { t } = useI18n();
  const { currentCall, isActive } = useCallsStore();
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [duration, setDuration] = useState(0);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  const [stuck, setStuck] = useState(false);

  // A call that has not connected after this long is not going to: say so instead of waiting forever.
  useEffect(() => {
    if (connectionState === 'connected') {
      setStuck(false);
      return;
    }
    const timer = setTimeout(() => setStuck(true), 20_000);
    return () => clearTimeout(timer);
  }, [connectionState]);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!isActive) return;

    const timer = setInterval(() => {
      if (currentCall?.startedAt) {
        setDuration(Math.floor((Date.now() - currentCall.startedAt) / 1000));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isActive, currentCall?.startedAt]);

  useEffect(() => {
    webrtcService.onRemoteStream((stream) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
      // Voice calls have no <video>, so the sound needs its own element.
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
        void remoteAudioRef.current.play().catch(() => {});
      }
    });

    webrtcService.onConnectionState((state) => {
      setConnectionState(state);
    });

    const localStream = webrtcService.getLocalStream();
    if (localStream && localVideoRef.current && currentCall?.type === 'VIDEO') {
      localVideoRef.current.srcObject = localStream;
    }
  }, [currentCall?.type]);

  const handleToggleMute = () => {
    const newValue = !isMuted;
    webrtcService.toggleAudio(!newValue);
    setIsMuted(newValue);
  };

  const handleToggleVideo = () => {
    const newValue = !isVideoOff;
    webrtcService.toggleVideo(!newValue);
    setIsVideoOff(newValue);
  };

  const handleSwitchCamera = async () => {
    const switched = await webrtcService.switchCamera();
    if (!switched) {
      toast(t('calls.switchCameraUnavailable'));
    }
  };

  const handleToggleShare = async () => {
    if (isScreenSharing) {
      await webrtcService.stopScreenShare();
      setIsScreenSharing(false);
      return;
    }

    const screenStream = await webrtcService.shareScreen();
    if (!screenStream) {
      toast.error(t('calls.shareUnavailable'));
      return;
    }

    setIsScreenSharing(true);
    // The browser's own "Stop sharing" control ends the track without going
    // through our button, so mirror that state back into the UI.
    screenStream.getVideoTracks()[0]?.addEventListener('ended', () => {
      setIsScreenSharing(false);
    });
  };

  const handleEnd = () => {
    webrtcService.cleanup();
    onEnd();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isVideo = currentCall?.type === 'VIDEO';

  return (
    <div className="fixed inset-0 z-50 bg-bg-app flex flex-col animate-fade-in">
      {!isVideo && <audio ref={remoteAudioRef} autoPlay />}
      {isVideo ? (
        <div className="flex-1 relative bg-black">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-4 right-4 w-32 h-40 rounded-lg overflow-hidden shadow-dropdown border-2 border-bg-panel">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : ''}`}
            />
            {isVideoOff && (
              <div className="w-full h-full bg-bg-hover flex items-center justify-center">
                <svg className="w-8 h-8 text-fg-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div
          className="flex-1 flex flex-col items-center justify-center p-8 text-center"
          style={{ background: 'radial-gradient(50% 45% at 50% 32%, rgb(var(--color-fg-accent) / 0.32), transparent 70%)' }}
        >
          <div
            className="w-28 h-28 rounded-full bg-gradient-to-br from-[#8f80ff] to-[#5a4de0] flex items-center justify-center text-white text-4xl font-semibold mb-6 overflow-hidden animate-float-up"
            style={{ boxShadow: '0 0 0 10px rgb(var(--color-fg-accent) / 0.14), 0 0 0 22px rgb(var(--color-fg-accent) / 0.07)' }}
          >
            {peerAvatar ? (
              <img src={peerAvatar} alt={peerName} className="w-full h-full rounded-full object-cover" />
            ) : (
              peerName[0]?.toUpperCase() || '?'
            )}
          </div>
          <h2 className="text-[22px] font-semibold text-fg-primary mt-4 mb-2">{peerName}</h2>
          <p className="inline-flex items-center gap-1.5 text-sm text-fg-success mb-3 tabular-nums">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            {connectionState === 'connected' ? `${formatDuration(duration)} · ${t('calls.encrypted')}` : t('calls.connecting')}
          </p>
          <div className="text-xs text-fg-tertiary">
            {connectionState === 'connecting' && t('calls.establishing')}
            {connectionState === 'connected' && t('calls.connected')}
            {connectionState === 'disconnected' && t('calls.disconnected')}
            {(connectionState === 'failed' || (stuck && connectionState !== 'connected')) && t('calls.failed')}
          </div>
        </div>
      )}

      <div className="p-6 pb-10">
        <div className="flex items-center justify-center gap-4">
          <CallRoundButton
            active={isMuted}
            onClick={handleToggleMute}
            label={isMuted ? t('calls.unmute') : t('calls.mute')}
          >
            {isMuted ? (
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            ) : (
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </CallRoundButton>

          {isVideo && (
            <CallRoundButton
              active={isVideoOff}
              onClick={handleToggleVideo}
              label={isVideoOff ? t('calls.videoOn') : t('calls.videoOff')}
            >
              {isVideoOff ? (
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
              )}
            </CallRoundButton>
          )}

          {isVideo && (
            <CallRoundButton
              
              onClick={handleSwitchCamera}
              label={t('calls.switchCamera')}
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 5h-3.17L15 3H9L7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
                <path d="M15 11l3-2v6l-3-2" />
                <circle cx="10" cy="12" r="2.5" />
              </svg>
            </CallRoundButton>
          )}

          {isVideo && (
            <CallRoundButton
              active={isScreenSharing}
              onClick={handleToggleShare}
              label={isScreenSharing ? t('calls.stopShareScreen') : t('calls.shareScreen')}
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="13" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
                {isScreenSharing && <line x1="1" y1="1" x2="23" y2="23" />}
              </svg>
            </CallRoundButton>
          )}

          <CallRoundButton
            end
            onClick={handleEnd}
            label={t('calls.endCall')}
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          </CallRoundButton>
        </div>
      </div>
    </div>
  );
}
