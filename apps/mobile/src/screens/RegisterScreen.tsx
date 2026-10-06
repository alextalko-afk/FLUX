import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { useAuthStore } from '../stores/auth.store';
import { ApiError } from '../lib/api';

export function RegisterScreen({ navigation }: any) {
  const { register, isLoading } = useAuthStore();
  const [form, setForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    username: '',
  });

  const handleRegister = async () => {
    if (!form.email || !form.password || !form.firstName) {
      Alert.alert('Error', 'Please fill in required fields');
      return;
    }
    if (form.password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }
    try {
      await register(form);
      Alert.alert('Success', 'Account created. Check your email for verification.');
      navigation.goBack();
    } catch (err) {
      if (err instanceof ApiError) {
        Alert.alert('Registration failed', err.message);
      } else if (err instanceof Error) {
        Alert.alert('Registration failed', err.message);
      }
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.form}>
        <Text style={styles.label}>Email *</Text>
        <TextInput
          style={styles.input}
          value={form.email}
          onChangeText={(v) => setForm({ ...form, email: v })}
          placeholder="you@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Text style={styles.label}>First name *</Text>
        <TextInput
          style={styles.input}
          value={form.firstName}
          onChangeText={(v) => setForm({ ...form, firstName: v })}
          placeholder="John"
        />

        <Text style={styles.label}>Last name</Text>
        <TextInput
          style={styles.input}
          value={form.lastName}
          onChangeText={(v) => setForm({ ...form, lastName: v })}
          placeholder="Doe"
        />

        <Text style={styles.label}>Username</Text>
        <TextInput
          style={styles.input}
          value={form.username}
          onChangeText={(v) => setForm({ ...form, username: v })}
          placeholder="johndoe"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Password *</Text>
        <TextInput
          style={styles.input}
          value={form.password}
          onChangeText={(v) => setForm({ ...form, password: v })}
          placeholder="••••••••"
          secureTextEntry
        />

        <TouchableOpacity
          style={styles.button}
          onPress={handleRegister}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Create account</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scroll: { padding: 24 },
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
});
