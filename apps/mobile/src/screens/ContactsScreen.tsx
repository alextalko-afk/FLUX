import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';

interface Contact {
  id: string;
  user: {
    id: string;
    firstName: string;
    lastName: string | null;
    username: string | null;
  };
}

export function ContactsScreen() {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');

  const { data } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => api.get<{ items: Contact[] }>('/contacts'),
  });

  const addMutation = useMutation({
    mutationFn: (targetUsername: string) =>
      api.post('/contacts', { targetUsername }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setUsername('');
      Alert.alert('Success', 'Contact added');
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        Alert.alert('Error', err.message);
      } else {
        Alert.alert('Error', 'Failed to add contact');
      }
    },
  });

  const removeMutation = useMutation({
    mutationFn: (contactId: string) => api.delete(`/contacts/${contactId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });

  const contacts = data?.items || [];

  const handleAdd = () => {
    const trimmed = username.trim().replace('@', '');
    if (!trimmed) return;
    addMutation.mutate(trimmed);
  };

  const renderItem = ({ item }: { item: Contact }) => (
    <View style={styles.item}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {item.user.firstName[0]?.toUpperCase() || '?'}
        </Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.name}>
          {item.user.firstName} {item.user.lastName || ''}
        </Text>
        {item.user.username && (
          <Text style={styles.username}>@{item.user.username}</Text>
        )}
      </View>
      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => removeMutation.mutate(item.id)}
      >
        <Text style={styles.removeText}>Remove</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.addForm}>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          placeholder="@username"
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleAdd}
          disabled={addMutation.isPending}
        >
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>

      {contacts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No contacts yet</Text>
        </View>
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  addForm: {
    flexDirection: 'row',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e4e9',
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e4e9',
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
  },
  addButton: {
    backgroundColor: '#2E7CF6',
    paddingHorizontal: 16,
    borderRadius: 10,
    justifyContent: 'center',
  },
  addButtonText: { color: '#fff', fontWeight: '600' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#606c7a' },
  item: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e4e9',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2E7CF6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  content: { flex: 1 },
  name: { fontSize: 15, fontWeight: '500', color: '#161c24' },
  username: { fontSize: 13, color: '#606c7a' },
  removeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#fee',
  },
  removeText: { color: '#dc3545', fontSize: 13 },
});
