import { useEffect, useState } from 'react';
import { useCallsStore } from '../../../stores/calls.store';
import { IncomingCallModal } from './IncomingCallModal';
import { ActiveCallScreen } from './ActiveCallScreen';
import { OutgoingCallScreen } from './OutgoingCallScreen';
import { webrtcService } from '../services/webrtc.service';
import { api } from '../../../lib/api';
import toast from 'react-hot-toast';
import { useI18n } from '../../../hooks/useI18n';

export function CallManager() {
  const { t } = useI18n();
  const { currentCall, isIncoming, isOutgoing, isActive, subscribe, accept, reject, end, reset } =
    useCallsStore();
  const [peerName, setPeerName] = useState('');
  const [peerAvatar, setPeerAvatar] = useState<string | null>(null);

  useEffect(() => {
    // Signals are collected from the moment the app is open, so an offer is never lost while the phone rings.
    webrtcService.listen();
    const unsubscribe = subscribe();
    return unsubscribe;
  }, [subscribe]);

  useEffect(() => {
    if (!currentCall) {
      setPeerName('');
      setPeerAvatar(null);
      return;
    }

    const peerId = isIncoming ? currentCall.callerId : currentCall.targetId;
    if (!peerId) return;

    api.get<any>(`/users/${peerId}/public`)
      .then((profile) => {
        setPeerName(`${profile.firstName} ${profile.lastName || ''}`.trim());
        setPeerAvatar(profile.avatarUrl);
      })
      .catch(() => {
        setPeerName(t('calls.unknown'));
      });
  }, [currentCall, isIncoming, t]);

  const handleAccept = async () => {
    if (!currentCall) return;

    try {
      const accepted = await api.post<any>('/calls/accept', { callId: currentCall.callId });
      accept();

      await webrtcService.initialize(
        currentCall.callId,
        currentCall.callerId,
        { audio: true, video: currentCall.type === 'VIDEO' },
        accepted?.iceServers,
      );

      // No offer here: the caller already sent one, and the service answers it
      // in its `call.sdp` handler. Creating a second offer here made both sides
      // offer at once, so ICE never settled.
    } catch (err) {
      toast.error(t('calls.acceptFailed'));
      reset();
    }
  };

  const handleReject = async () => {
    if (!currentCall) return;

    try {
      await api.post('/calls/reject', { callId: currentCall.callId });
    } catch {
      // ignore
    }
    reject();
  };

  const handleEnd = async () => {
    if (!currentCall) return;

    try {
      await api.post('/calls/end', { callId: currentCall.callId });
    } catch {
      // ignore
    }
    webrtcService.cleanup();
    end();
  };

  if (isIncoming && currentCall) {
    return (
      <IncomingCallModal
        callerName={peerName || t('calls.unknown')}
        callerAvatar={peerAvatar}
        onAccept={handleAccept}
        onReject={handleReject}
      />
    );
  }

  if (isActive && currentCall) {
    return (
      <ActiveCallScreen
        peerName={peerName || t('calls.unknown')}
        peerAvatar={peerAvatar}
        onEnd={handleEnd}
      />
    );
  }

  // The outgoing state used to render nothing at all, so pressing the call
  // button looked like it did nothing. This screen is what the caller should
  // see while waiting for the other side to pick up.
  if (isOutgoing && currentCall) {
    return (
      <OutgoingCallScreen
        peerName={peerName || t('calls.unknown')}
        peerAvatar={peerAvatar}
        callType={currentCall.type}
        onCancel={handleEnd}
      />
    );
  }

  return null;
}
