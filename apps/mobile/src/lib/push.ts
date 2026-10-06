import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { api } from './api';

const TOKEN_KEY = 'flux_push_token';

// Show the banner and play the sound even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Asks for permission and registers this phone's Expo push token with the server, so messages
 * reach it while the app is closed. Returns the token, or `null` when push is not available
 * (web, simulator without a project id, permission refused).
 */
export async function registerForPush(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    // EAS project id, set at build time (EXPO_PUBLIC_EAS_PROJECT_ID); Expo Go needs none.
    const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
    const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);

    await api.post('/notifications/devices', {
      provider: 'expo',
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      token: data,
    });
    await SecureStore.setItemAsync(TOKEN_KEY, data);
    return data;
  } catch {
    // Push is a convenience; the app works without it.
    return null;
  }
}

/** Forgets this phone on the server; call before the session ends so the next user does not get these messages. */
export async function unregisterPush(): Promise<void> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!token) return;
    await api.delete('/notifications/devices', { token });
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Offline or already gone: the server drops dead tokens by itself.
  }
}
