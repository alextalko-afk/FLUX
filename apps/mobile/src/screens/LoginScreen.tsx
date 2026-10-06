import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useAuthStore } from '../stores/auth.store';
import { ApiError } from '../lib/api';

export function LoginScreen({ navigation }: any) {
  const { login, isLoading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    try {
      await login(email.trim(), password);
    } catch (err) {
      if (err instanceof ApiError) {
        Alert.alert('Login failed', err.message);
      } else if (err instanceof Error) {
        Alert.alert('Login failed', err.message);
      } else {
        Alert.alert('Login failed', 'Unknown error');
      }
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>TG</Text>
          </View>
          <Text style={styles.title}>FLUX</Text>
          <Text style={styles.subtitle}>Independent messaging application</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            autoComplete="password"
          />

          <TouchableOpacity
            style={styles.button}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Log in</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => navigation.navigate('Register')}
          >
            <Text style={styles.linkText}>
              Don't have an account? <Text style={styles.linkBold}>Sign up</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 32 },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#2E7CF6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoText: { color: '#fff', fontSize: 32, fontWeight: 'bold' },
  title: { fontSize: 24, fontWeight: '600', color: '#161c24', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#606c7a' },
  form: { gap: 12 },
  label: { fontSize: 14, fontWeight: '500', color: '#161c24', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#e0e4e9',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#161c24',
    backgroundColor: '#fff',
  },
  button: {
    backgroundColor: '#2E7CF6',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  linkButton: { alignItems: 'center', marginTop: 8 },
  linkText: { fontSize: 14, color: '#606c7a' },
  linkBold: { color: '#2E7CF6', fontWeight: '600' },
});
