import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useCallsStore } from '../stores/calls.store';

export function CallScreen({ route, navigation }: any) {
  const { peerName, type } = route.params || {};
  const { end, currentCall } = useCallsStore();
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      if (currentCall?.startedAt) {
        setDuration(Math.floor((Date.now() - currentCall.startedAt) / 1000));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [currentCall?.startedAt]);

  const handleEnd = () => {
    end();
    navigation.goBack();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.peerInfo}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {peerName?.[0]?.toUpperCase() || '?'}
          </Text>
        </View>
        <Text style={styles.peerName}>{peerName || 'Unknown'}</Text>
        <Text style={styles.status}>
          {type === 'VIDEO' ? 'Video call' : 'Audio call'} • {formatDuration(duration)}
        </Text>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.controlButton, isMuted && styles.controlButtonActive]}
          onPress={() => setIsMuted(!isMuted)}
        >
          <Text style={styles.controlText}>{isMuted ? '🔇' : '🎤'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, styles.endButton]}
          onPress={handleEnd}
        >
          <Text style={styles.controlText}>📞</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'space-between',
    padding: 24,
  },
  peerInfo: { alignItems: 'center', marginTop: 60 },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#2E7CF6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: { color: '#fff', fontSize: 48, fontWeight: '600' },
  peerName: { fontSize: 24, fontWeight: '600', color: '#fff', marginBottom: 8 },
  status: { fontSize: 14, color: 'rgba(255,255,255,0.7)' },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 40,
  },
  controlButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButtonActive: { backgroundColor: 'rgba(220,53,69,0.6)' },
  endButton: { backgroundColor: '#dc3545' },
  controlText: { fontSize: 24 },
});
