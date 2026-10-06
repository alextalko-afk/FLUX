import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';
import { realtime } from '../lib/realtime';
import { uuidv4 } from '../lib/ids';

interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  createdAt: string;
  status: string;
  sender?: { firstName: string; lastName?: string | null };
}

export function ChatScreen({ route }: any) {
  const { chatId } = route.params;
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [input, setInput] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['messages', chatId],
    queryFn: () => api.get<{ items: Message[] }>(`/chats/${chatId}/messages?limit=50`),
  });

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      const clientTempId = uuidv4();
      return api.post<any>(`/chats/${chatId}/messages`, {
        type: 'TEXT',
        content,
        clientTempId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', chatId] });
    },
  });

  useEffect(() => {
    const unsub = realtime.on('message.new', (payload) => {
      if (payload.chatId === chatId) {
        queryClient.invalidateQueries({ queryKey: ['messages', chatId] });
      }
    });
    return unsub;
  }, [chatId, queryClient]);

  const messages = data?.items || [];

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    sendMutation.mutate(trimmed);
    setInput('');
  };

  const renderItem = ({ item }: { item: Message }) => {
    const isOwn = item.senderId === user?.id;
    return (
      <View style={[styles.messageBubble, isOwn ? styles.ownBubble : styles.otherBubble]}>
        {!isOwn && item.sender && (
          <Text style={styles.senderName}>
            {item.sender.firstName} {item.sender.lastName || ''}
          </Text>
        )}
        <Text style={styles.messageText}>{item.content}</Text>
        <Text style={styles.messageTime}>
          {format(new Date(item.createdAt), 'HH:mm')}
        </Text>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2E7CF6" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
      />
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Write a message..."
          multiline
          maxLength={4096}
        />
        <TouchableOpacity
          style={[styles.sendButton, !input.trim() && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || sendMutation.isPending}
        >
          {sendMutation.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.sendButtonText}>Send</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ecf4fa' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 12 },
  messageBubble: {
    maxWidth: '75%',
    padding: 10,
    borderRadius: 12,
    marginBottom: 6,
  },
  ownBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#daeafc',
  },
  otherBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
  },
  senderName: { fontSize: 12, color: '#2E7CF6', fontWeight: '500', marginBottom: 2 },
  messageText: { fontSize: 15, color: '#161c24' },
  messageTime: { fontSize: 11, color: '#8c98a8', marginTop: 4, alignSelf: 'flex-end' },
  inputRow: {
    flexDirection: 'row',
    padding: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e4e9',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e4e9',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    maxHeight: 120,
    backgroundColor: '#fff',
  },
  sendButton: {
    marginLeft: 8,
    backgroundColor: '#2E7CF6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonText: { color: '#fff', fontWeight: '600' },
});
