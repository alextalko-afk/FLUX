import { create } from 'zustand';

type CallState = 'idle' | 'incoming' | 'outgoing' | 'active' | 'ended';

interface CallInfo {
  callId: string;
  callerId: string;
  targetId: string;
  type: 'AUDIO' | 'VIDEO';
  state: CallState;
  startedAt: number | null;
}

interface CallsState {
  currentCall: CallInfo | null;
  isIncoming: boolean;
  isActive: boolean;
  handleIncoming: (payload: any) => void;
  handleAccepted: (payload: any) => void;
  handleEnded: () => void;
  accept: () => void;
  end: () => void;
  reset: () => void;
}

export const useCallsStore = create<CallsState>((set, get) => ({
  currentCall: null,
  isIncoming: false,
  isActive: false,

  handleIncoming: (payload) => {
    set({
      currentCall: {
        callId: payload.callId,
        callerId: payload.callerId,
        targetId: '',
        type: payload.type,
        state: 'incoming',
        startedAt: null,
      },
      isIncoming: true,
    });
  },

  handleAccepted: () => {
    const call = get().currentCall;
    if (!call) return;
    set({
      currentCall: { ...call, state: 'active', startedAt: Date.now() },
      isIncoming: false,
      isActive: true,
    });
  },

  handleEnded: () => {
    set({ currentCall: null, isIncoming: false, isActive: false });
  },

  accept: () => {
    const call = get().currentCall;
    if (!call) return;
    set({
      currentCall: { ...call, state: 'active', startedAt: Date.now() },
      isIncoming: false,
      isActive: true,
    });
  },

  end: () => {
    set({ currentCall: null, isIncoming: false, isActive: false });
  },

  reset: () => {
    set({ currentCall: null, isIncoming: false, isActive: false });
  },
}));
