import { create } from 'zustand';
import { realtime } from '../lib/realtime';

type CallState = 'idle' | 'incoming' | 'outgoing' | 'connecting' | 'active' | 'ended';

interface CallInfo {
  callId: string;
  callerId: string;
  targetId: string;
  type: 'AUDIO' | 'VIDEO';
  state: CallState;
  startedAt: number | null;
  duration: number;
}

interface CallsState {
  currentCall: CallInfo | null;
  isIncoming: boolean;
  isOutgoing: boolean;
  isActive: boolean;
  initOutgoing: (targetId: string, type: 'AUDIO' | 'VIDEO', callId?: string) => void;
  handleIncoming: (payload: any) => void;
  handleAccepted: (payload: any) => void;
  handleRejected: (payload: any) => void;
  handleEnded: (payload: any) => void;
  accept: () => void;
  reject: () => void;
  end: () => void;
  reset: () => void;
  subscribe: () => () => void;
}

export const useCallsStore = create<CallsState>((set, get) => ({
  currentCall: null,
  isIncoming: false,
  isOutgoing: false,
  isActive: false,

  initOutgoing: (targetId, type, callId = '') => {
    set({
      currentCall: {
        callId,
        callerId: '',
        targetId,
        type,
        state: 'outgoing',
        startedAt: null,
        duration: 0,
      },
      isOutgoing: true,
      isIncoming: false,
    });
  },

  handleIncoming: (payload) => {
    set({
      currentCall: {
        callId: payload.callId,
        callerId: payload.callerId,
        targetId: '',
        type: payload.type,
        state: 'incoming',
        startedAt: null,
        duration: 0,
      },
      isIncoming: true,
      isOutgoing: false,
    });
  },

  handleAccepted: (payload) => {
    const call = get().currentCall;
    if (!call) return;
    set({
      currentCall: {
        ...call,
        callId: payload.callId || call.callId,
        state: 'active',
        startedAt: Date.now(),
      },
      isIncoming: false,
      isOutgoing: false,
      isActive: true,
    });
  },

  handleRejected: () => {
    set({
      currentCall: null,
      isIncoming: false,
      isOutgoing: false,
      isActive: false,
    });
  },

  handleEnded: () => {
    set({
      currentCall: null,
      isIncoming: false,
      isOutgoing: false,
      isActive: false,
    });
  },

  accept: () => {
    const call = get().currentCall;
    if (!call || call.state !== 'incoming') return;
    set({
      currentCall: { ...call, state: 'active', startedAt: Date.now() },
      isIncoming: false,
      isActive: true,
    });
  },

  reject: () => {
    const call = get().currentCall;
    if (!call) return;
    set({
      currentCall: null,
      isIncoming: false,
      isOutgoing: false,
    });
  },

  end: () => {
    set({
      currentCall: null,
      isIncoming: false,
      isOutgoing: false,
      isActive: false,
    });
  },

  reset: () => {
    set({
      currentCall: null,
      isIncoming: false,
      isOutgoing: false,
      isActive: false,
    });
  },

  subscribe: () => {
    const unsubIncoming = realtime.on('call.incoming', (payload) => {
      get().handleIncoming(payload);
    });

    const unsubAccepted = realtime.on('call.accepted', (payload) => {
      get().handleAccepted(payload);
    });

    const unsubRejected = realtime.on('call.rejected', (payload) => {
      get().handleRejected(payload);
    });

    const unsubEnded = realtime.on('call.ended', (payload) => {
      get().handleEnded(payload);
    });

    return () => {
      unsubIncoming();
      unsubAccepted();
      unsubRejected();
      unsubEnded();
    };
  },
}));
