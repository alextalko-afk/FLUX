import { Button } from '../../../components/ui/Button';
import { useStartCall } from '../hooks/useStartCall';
import { useI18n } from '../../../hooks/useI18n';

interface CallButtonProps {
  targetUserId: string;
  type?: 'AUDIO' | 'VIDEO';
}

export function CallButton({ targetUserId, type = 'AUDIO' }: CallButtonProps) {
  const { t } = useI18n();
  const { start, isCalling } = useStartCall();
  const handleCall = () => void start(targetUserId, type);

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={handleCall}
      isLoading={isCalling}
      aria-label={type === 'VIDEO' ? t('calls.videoCall') : t('calls.audioCall')}
    >
      {type === 'VIDEO' ? (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
      ) : (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      )}
    </Button>
  );
}
