import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from './src/stores/auth.store';
import { registerForPush } from './src/lib/push';
import { LoginScreen } from './src/screens/LoginScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { MainTabs } from './src/screens/MainTabs';
import { ChatScreen } from './src/screens/ChatScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { CallScreen } from './src/screens/CallScreen';

const Stack = createNativeStackNavigator();
const queryClient = new QueryClient();

export default function App() {
  const { isAuthenticated, hydrate } = useAuthStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Register this phone for push once signed in (and again after each fresh sign-in).
  useEffect(() => {
    if (isAuthenticated) void registerForPush();
  }, [isAuthenticated]);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer>
          <StatusBar style="auto" />
          <Stack.Navigator>
            {!isAuthenticated ? (
              <>
                <Stack.Screen
                  name="Login"
                  component={LoginScreen}
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="Register"
                  component={RegisterScreen}
                  options={{ title: 'Create account' }}
                />
              </>
            ) : (
              <>
                <Stack.Screen
                  name="Main"
                  component={MainTabs}
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="Chat"
                  component={ChatScreen}
                  options={({ route }: any) => ({
                    title: route.params?.title || 'Chat',
                  })}
                />
                <Stack.Screen
                  name="Settings"
                  component={SettingsScreen}
                  options={{ title: 'Settings' }}
                />
                <Stack.Screen
                  name="Call"
                  component={CallScreen}
                  options={{ headerShown: false, presentation: 'fullScreenModal' }}
                />
              </>
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
