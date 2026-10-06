import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../../lib/api';
import { useI18n } from '../../../hooks/useI18n';
import { useCallsStore } from '../../../stores/calls.store';
import { webrtcService } from '../services/webrtc.service';

/** Starts a one-to-one call: asks the server, opens the outgoing screen and sends the WebRTC offer. */
export function useStartCall() {
  const { t } = useI18n();
  const initOutgoing = useCallsStore((s) => s.initOutgoing);
  const [isCalling, setIsCalling] = useState(false);

  const start = useCallback(
    async (targetUserId: string, type: 'AUDIO' | 'VIDEO' = 'AUDIO') => {
      setIsCalling(true);
      try {
        const result = await api.post<any>('/calls/initiate', { targetUserId, type });
        initOutgoing(targetUserId, type, result.callId);
        // The offer goes out when the other side picks up (see offerWhenAccepted), not into the ringing void.
        // Registered first, so an answer that comes while the microphone prompt is open is not missed.
        webrtcService.offerWhenAccepted(result.callId);
        await webrtcService.initialize(result.callId, targetUserId, { audio: true, video: type === 'VIDEO' }, result.iceServers);
        toast.success(t('calls.initiated'));
      } catch {
        toast.error(t('calls.startFailed'));
      } finally {
        setIsCalling(false);
      }
    },
    [initOutgoing, t],
  );

  return { start, isCalling };
}
