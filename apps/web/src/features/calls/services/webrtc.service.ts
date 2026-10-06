import { realtime } from '../../../lib/realtime';

interface CallConfig {
  iceServers: RTCIceServer[];
}

const DEFAULT_CONFIG: CallConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

interface SdpSignal {
  callId: string;
  signalType: 'offer' | 'answer';
  sdp: string;
}
interface IceSignal {
  callId: string;
  candidate: string;
}

class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private callId: string | null = null;
  private targetUserId: string | null = null;
  private onRemoteStreamCallback: ((stream: MediaStream) => void) | null = null;
  private onIceCandidateCallback: ((candidate: RTCIceCandidate) => void) | null = null;
  private onConnectionStateCallback: ((state: RTCPeerConnectionState) => void) | null = null;
  private unsubscribers: Array<() => void> = [];

  /**
   * Signals can arrive before this device is ready for them: the caller's offer travels while the callee is
   * still answering the phone or waiting for the microphone prompt. They are kept here, per call, and
   * replayed once the peer connection exists. Dropping them is what used to leave both sides on "connecting".
   */
  private listening = false;
  private pendingSdp = new Map<string, SdpSignal>();
  private pendingIce = new Map<string, string[]>();
  /** Resolves when the local media is attached to the peer connection. */
  private ready: Promise<void> = Promise.resolve();

  /** Starts listening for call signals for the whole session of the app. Safe to call more than once. */
  listen(): void {
    if (this.listening) return;
    this.listening = true;
    realtime.on('call.sdp', (payload: SdpSignal) => void this.onSdp(payload));
    realtime.on('call.ice', (payload: IceSignal) => void this.onIce(payload));
  }

  async initialize(
    callId: string,
    targetUserId: string,
    options: { audio: boolean; video: boolean } = { audio: true, video: false },
    iceServers?: RTCIceServer[],
  ): Promise<MediaStream> {
    this.listen();
    this.callId = callId;
    this.targetUserId = targetUserId;

    const config = this.getConfig(iceServers);
    const peer = new RTCPeerConnection(config);
    this.peerConnection = peer;

    peer.onicecandidate = (event) => {
      if (event.candidate && this.callId && this.targetUserId) {
        realtime.send('call.signal', {
          callId: this.callId,
          targetUserId: this.targetUserId,
          signalType: 'ice',
          candidate: JSON.stringify(event.candidate),
        });
      }
    };

    peer.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        this.remoteStream = remoteStream;
        this.onRemoteStreamCallback?.(remoteStream);
      }
    };

    peer.onconnectionstatechange = () => {
      if (this.peerConnection === peer) this.onConnectionStateCallback?.(peer.connectionState);
    };

    // Media is attached in the background of "ready", so an offer that arrives during the microphone prompt waits for it.
    this.ready = (async () => {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: options.audio, video: options.video });
      this.localStream.getTracks().forEach((track) => peer.addTrack(track, this.localStream!));
    })();
    await this.ready;

    // Whatever arrived for this call while we were not ready yet.
    const offer = this.pendingSdp.get(callId);
    if (offer) {
      this.pendingSdp.delete(callId);
      void this.onSdp(offer);
    }

    return this.localStream!;
  }

  private getConfig(provided?: RTCIceServer[]): RTCConfiguration {
    // The server ships STUN/TURN with the call response; that list wins
    // because it is the only place the TURN credentials actually exist.
    if (provided && provided.length > 0) {
      return { iceServers: provided };
    }

    const turnUrl = (window as any).__TURN_URL__;
    const turnUsername = (window as any).__TURN_USERNAME__;
    const turnCredential = (window as any).__TURN_CREDENTIAL__;

    const iceServers: RTCIceServer[] = [...DEFAULT_CONFIG.iceServers];

    if (turnUrl && turnUsername && turnCredential) {
      iceServers.push({
        urls: turnUrl,
        username: turnUsername,
        credential: turnCredential,
      });
    }

    return { iceServers };
  }

  private async onSdp(payload: SdpSignal): Promise<void> {
    const peer = this.peerConnection;
    if (!peer || payload.callId !== this.callId) {
      // Not our call (yet): keep the newest offer for when this device picks up.
      if (payload.signalType === 'offer') this.pendingSdp.set(payload.callId, payload);
      return;
    }
    await this.ready;

    try {
      if (payload.signalType === 'answer') {
        if (peer.signalingState !== 'have-local-offer') return;
        await peer.setRemoteDescription(JSON.parse(payload.sdp));
        await this.flushIce(payload.callId);
        return;
      }

      // Offer: we are the callee, so answer instead of offering again.
      await peer.setRemoteDescription(JSON.parse(payload.sdp));
      await this.flushIce(payload.callId);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      realtime.send('call.signal', {
        callId: this.callId!,
        targetUserId: this.targetUserId!,
        signalType: 'answer',
        sdp: JSON.stringify(answer),
      });
    } catch (err) {
      console.warn('Call signalling failed:', err);
    }
  }

  private async onIce(payload: IceSignal): Promise<void> {
    const peer = this.peerConnection;
    // A candidate can only be applied after the remote description; until then it waits in line.
    if (!peer || payload.callId !== this.callId || !peer.remoteDescription) {
      const queue = this.pendingIce.get(payload.callId) ?? [];
      queue.push(payload.candidate);
      this.pendingIce.set(payload.callId, queue);
      return;
    }
    try {
      await peer.addIceCandidate(JSON.parse(payload.candidate));
    } catch (err) {
      console.warn('Could not add ICE candidate:', err);
    }
  }

  private async flushIce(callId: string): Promise<void> {
    const peer = this.peerConnection;
    const queue = this.pendingIce.get(callId);
    if (!peer || !queue) return;
    this.pendingIce.delete(callId);
    for (const candidate of queue) {
      try {
        await peer.addIceCandidate(JSON.parse(candidate));
      } catch (err) {
        console.warn('Could not add queued ICE candidate:', err);
      }
    }
  }

  /**
   * The caller sends its offer once the other side has picked up, not before: at that point the callee
   * is listening, and nothing is sent into the void while the phone is still ringing.
   */
  offerWhenAccepted(callId: string): void {
    const off = realtime.on('call.accepted', (payload: { callId?: string }) => {
      if (payload?.callId !== callId) return;
      off();
      this.unsubscribers = this.unsubscribers.filter((u) => u !== off);
      void this.createOffer().catch((err) => console.warn('Could not create the offer:', err));
    });
    this.unsubscribers.push(off);
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }
    await this.ready;
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    realtime.send('call.signal', {
      callId: this.callId!,
      targetUserId: this.targetUserId!,
      signalType: 'offer',
      sdp: JSON.stringify(offer),
    });

    return offer;
  }

  onRemoteStream(callback: (stream: MediaStream) => void): void {
    this.onRemoteStreamCallback = callback;
    if (this.remoteStream) {
      callback(this.remoteStream);
    }
  }

  onConnectionState(callback: (state: RTCPeerConnectionState) => void): void {
    this.onConnectionStateCallback = callback;
  }

  toggleAudio(enabled: boolean): void {
    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  toggleVideo(enabled: boolean): void {
    this.localStream?.getVideoTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  /**
   * Switches between the front and rear camera.
   *
   * Browsers expose no direct "switch" primitive, so this re-acquires a video
   * track with the opposite `facingMode` and swaps it into both the local
   * stream and the active RTCPeerConnection sender.
   *
   * Desktop browsers normally have a single camera and ignore `facingMode`; in
   * that case `getUserMedia` succeeds but returns the same device, and we
   * report that honestly instead of pretending the switch happened.
   */
  async switchCamera(): Promise<boolean> {
    const sender = this.peerConnection
      ?.getSenders()
      .find((candidate) => candidate.track?.kind === 'video');

    const currentTrack = this.localStream?.getVideoTracks()[0];

    if (!currentTrack || !sender) {
      return false;
    }

    const currentFacing = currentTrack.getSettings().facingMode;
    const nextFacing = currentFacing === 'environment' ? 'user' : 'environment';

    try {
      const replacement = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: nextFacing } },
        audio: false,
      });

      const newTrack = replacement.getVideoTracks()[0];
      if (!newTrack) {
        replacement.getTracks().forEach((track) => track.stop());
        return false;
      }

      // A single-camera device returns the same facing mode; treat that as
      // "no switch available" and keep the existing track running.
      if (newTrack.getSettings().facingMode === currentFacing) {
        replacement.getTracks().forEach((track) => track.stop());
        return false;
      }

      await sender.replaceTrack(newTrack);

      this.localStream?.removeTrack(currentTrack);
      currentTrack.stop();
      this.localStream?.addTrack(newTrack);

      return true;
    } catch (err) {
      // `OverconstrainedError` means the requested camera does not exist.
      console.warn('Camera switch unavailable on this device:', err);
      return false;
    }
  }

  async shareScreen(): Promise<MediaStream | null> {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      const videoTrack = screenStream.getVideoTracks()[0];
      if (!videoTrack || !this.peerConnection || !this.localStream) {
        return null;
      }

      const sender = this.peerConnection
        .getSenders()
        .find((s) => s.track?.kind === 'video');

      if (sender) {
        await sender.replaceTrack(videoTrack);
      }

      videoTrack.onended = () => {
        const localVideoTrack = this.localStream?.getVideoTracks()[0];
        if (localVideoTrack && sender) {
          sender.replaceTrack(localVideoTrack);
        }
      };

      return screenStream;
    } catch (err) {
      console.error('Screen share failed:', err);
      return null;
    }
  }

  async stopScreenShare(): Promise<void> {
    if (!this.localStream) return;
    const localVideoTrack = this.localStream.getVideoTracks()[0];
    if (!localVideoTrack || !this.peerConnection) return;

    const sender = this.peerConnection
      .getSenders()
      .find((s) => s.track?.kind === 'video');

    if (sender) {
      await sender.replaceTrack(localVideoTrack);
    }
  }

  cleanup(): void {
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.callId) {
      this.pendingSdp.delete(this.callId);
      this.pendingIce.delete(this.callId);
    }
    this.ready = Promise.resolve();
    this.remoteStream = null;
    this.callId = null;
    this.targetUserId = null;
    this.onRemoteStreamCallback = null;
    this.onIceCandidateCallback = null;
    this.onConnectionStateCallback = null;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }
}

export const webrtcService = new WebRTCService();
