import { describe, it, expect, beforeEach, vi } from 'vitest';

// A tiny in-memory stand-in for the websocket client: handlers by event, and a log of what was sent.
const handlers = new Map<string, Set<(payload: any) => void>>();
const sent: { event: string; data: any }[] = [];
vi.mock('../../../apps/web/src/lib/realtime', () => ({
  realtime: {
    on: (event: string, handler: (payload: any) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
      return () => handlers.get(event)?.delete(handler);
    },
    send: (event: string, data: any) => sent.push({ event, data }),
  },
}));
const emit = (event: string, payload: unknown) => handlers.get(event)?.forEach((h) => h(payload));

class FakePeer {
  static last: FakePeer;
  signalingState = 'stable';
  remoteDescription: unknown = null;
  connectionState = 'new';
  added: unknown[] = [];
  onicecandidate: unknown;
  ontrack: unknown;
  onconnectionstatechange: unknown;
  constructor() {
    FakePeer.last = this;
  }
  addTrack() {}
  async setRemoteDescription(d: unknown) {
    this.remoteDescription = d;
  }
  async setLocalDescription() {
    this.signalingState = 'have-local-offer';
  }
  async createOffer() {
    return { type: 'offer', sdp: 'o' };
  }
  async createAnswer() {
    return { type: 'answer', sdp: 'a' };
  }
  async addIceCandidate(c: unknown) {
    if (!this.remoteDescription) throw new Error('no remote description');
    this.added.push(c);
  }
  getSenders() {
    return [];
  }
  close() {}
}

const stream = { getTracks: () => [{ stop() {} }], getAudioTracks: () => [], getVideoTracks: () => [] };

describe('call signalling', () => {
  let service: typeof import('../../../apps/web/src/features/calls/services/webrtc.service').webrtcService;

  beforeEach(async () => {
    handlers.clear();
    sent.length = 0;
    vi.resetModules();
    vi.stubGlobal('RTCPeerConnection', FakePeer);
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => stream } });
    service = (await import('../../../apps/web/src/features/calls/services/webrtc.service')).webrtcService;
  });

  it('answers an offer that arrived before the callee picked up', async () => {
    service.listen();
    // The caller's offer and two ICE candidates travel while the phone is still ringing.
    emit('call.sdp', { callId: 'c1', signalType: 'offer', sdp: JSON.stringify({ type: 'offer', sdp: 'x' }) });
    emit('call.ice', { callId: 'c1', candidate: JSON.stringify({ candidate: 'one' }) });
    emit('call.ice', { callId: 'c1', candidate: JSON.stringify({ candidate: 'two' }) });
    expect(sent).toHaveLength(0);

    await service.initialize('c1', 'caller', { audio: true, video: false }, []);
    await vi.waitFor(() => expect(sent.some((m) => m.data.signalType === 'answer')).toBe(true));
    // The candidates were applied only after the remote description, in order.
    expect(FakePeer.last.added).toEqual([{ candidate: 'one' }, { candidate: 'two' }]);
  });

  it('holds candidates back until the answer arrives on the caller side', async () => {
    service.listen();
    await service.initialize('c2', 'callee', { audio: true, video: false }, []);
    await service.createOffer();
    emit('call.ice', { callId: 'c2', candidate: JSON.stringify({ candidate: 'early' }) });
    expect(FakePeer.last.added).toHaveLength(0);

    emit('call.sdp', { callId: 'c2', signalType: 'answer', sdp: JSON.stringify({ type: 'answer', sdp: 'y' }) });
    await vi.waitFor(() => expect(FakePeer.last.added).toEqual([{ candidate: 'early' }]));
  });

  it('sends the offer only after the call is accepted', async () => {
    service.listen();
    service.offerWhenAccepted('c3');
    await service.initialize('c3', 'callee', { audio: true, video: false }, []);
    expect(sent.filter((m) => m.data.signalType === 'offer')).toHaveLength(0);

    emit('call.accepted', { callId: 'other' });
    expect(sent.filter((m) => m.data.signalType === 'offer')).toHaveLength(0);

    emit('call.accepted', { callId: 'c3' });
    await vi.waitFor(() => expect(sent.filter((m) => m.data.signalType === 'offer')).toHaveLength(1));
    emit('call.accepted', { callId: 'c3' });
    await new Promise((r) => setTimeout(r, 20));
    expect(sent.filter((m) => m.data.signalType === 'offer')).toHaveLength(1);
  });
});
