import { useState, useEffect } from 'react';
import { Button } from '../../../components/ui/Button';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { useMediaUpload } from '../hooks/useMediaUpload';
import toast from 'react-hot-toast';
import { useI18n } from '../../../hooks/useI18n';

interface VoiceRecorderProps {
  chatId: string;
  onSend: (fileObjectId: string, duration: number, waveform: number[]) => void;
  onCancel: () => void;
}

export function VoiceRecorder({ chatId, onSend, onCancel }: VoiceRecorderProps) {
  const { t } = useI18n();
  const { isRecording, duration, start, stop, cancel, error } = useVoiceRecorder();
  const { upload, isUploading, progress } = useMediaUpload();
  const [isSending, setIsSending] = useState(false);

  // Start capturing as soon as the recorder mounts and always release the
  // microphone on the way out — including when the user navigates away mid
  // recording, which the previous `isRecording`-captured cleanup missed.
  useEffect(() => {
    void start();
    return () => cancel();
  }, [start, cancel]);

  useEffect(() => {
    if (error) {
      toast.error(error);
      onCancel();
    }
  }, [error, onCancel]);

  const handleStop = async () => {
    const result = await stop();
    if (!result) return;

    setIsSending(true);
    try {
      const file = new File([result.blob], `voice-${Date.now()}.webm`, {
        type: 'audio/webm',
      });

      const uploadResult = await upload(file, chatId);
      onSend(uploadResult.fileObjectId, result.duration, result.waveform);
    } catch {
      toast.error(t('messages.voiceFailed'));
      onCancel();
    } finally {
      setIsSending(false);
    }
  };

  const handleCancel = () => {
    cancel();
    onCancel();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-bg-panel border-t border-border">
      <div className="flex items-center gap-2 flex-1">
        <div className="w-3 h-3 rounded-full bg-fg-error animate-pulse" />
        <div className="text-sm text-fg-primary font-mono">
          {formatDuration(duration)}
        </div>
        {isUploading && progress && (
          <div className="text-xs text-fg-secondary ml-2">
            {t('chats.uploading')} {progress.percent}%
          </div>
        )}
      </div>

      <Button
        variant="secondary"
        size="sm"
        onClick={handleCancel}
        disabled={isSending}
      >
        {t('common.cancel')}
      </Button>

      <Button
        variant="primary"
        size="sm"
        onClick={handleStop}
        isLoading={isSending}
        disabled={!isRecording}
      >
        {t('messages.send')}
      </Button>
    </div>
  );
}
