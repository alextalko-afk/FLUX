import { useEffect, useRef } from 'react';
import { useCallsStore } from '../../../stores/calls.store';
import { Button } from '../../../components/ui/Button';
import { useI18n } from '../../../hooks/useI18n';

interface IncomingCallModalProps {
  callerName: string;
  callerAvatar?: string | null;
  onAccept: () => void;
  onReject: () => void;
}

export function IncomingCallModal({
  callerName,
  callerAvatar,
  onAccept,
  onReject,
}: IncomingCallModalProps) {
  const { t } = useI18n();
  const { currentCall } = useCallsStore();
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // No bundled ringtone; use system notification sound if available
    return () => {
      if (ringtoneRef.current) {
        ringtoneRef.current.pause();
        ringtoneRef.current = null;
      }
    };
  }, []);

  if (!currentCall || currentCall.state !== 'incoming') return null;

  const isVideo = currentCall.type === 'VIDEO';

  return (
    <div className="fixed inset-0 z-50 bg-bg-overlay flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-bg-panel rounded-panel shadow-dropdown w-full max-w-sm p-6 animate-slide-up">
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-4 animate-float-up">
            {/* Pulsing ring that signals an incoming call. */}
            <span
              aria-hidden
              className="absolute inset-0 rounded-full border-2 border-fg-accent animate-pulse-ring"
            />
            <span
              aria-hidden
              className="absolute inset-0 rounded-full border-2 border-fg-accent animate-pulse-ring"
              style={{ animationDelay: '0.6s' }}
            />
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-fg-accent to-[#5b7cfa] flex items-center justify-center text-fg-inverse text-3xl font-semibold shadow-accent overflow-hidden">
              {callerAvatar ? (
                <img src={callerAvatar} alt={callerName} className="w-full h-full rounded-full object-cover" />
              ) : (
                callerName[0]?.toUpperCase() || '?'
              )}
            </div>
            <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-fg-success rounded-full flex items-center justify-center animate-pulse">
              <svg className="w-4 h-4 text-fg-inverse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </div>
          </div>

          <h2 className="text-xl font-semibold text-fg-primary mb-1">{callerName}</h2>
          <p className="text-sm text-fg-secondary mb-6">
            {t('calls.incomingCall', { type: t(`calls.${isVideo ? 'video' : 'audio'}`) })}
          </p>

          <div className="flex gap-3 w-full">
            <Button
              variant="danger"
              size="lg"
              onClick={onReject}
              className="flex-1"
              aria-label={t('calls.declineCall')}
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
              {t('calls.decline')}
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={onAccept}
              className="flex-1"
              aria-label={t('calls.acceptCall')}
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              {t('calls.accept')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
