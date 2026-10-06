import React, { useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { api } from '../lib/api';

interface Chat {
  id: string;
  type: string;
  title: string | null;
  members: { userId: string; user?: any }[];
  lastMessage?: {
    content: string;
    createdAt: string;
  } | null;
}

export function ChatsListScreen({ navigation }: any) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['chats'],
    queryFn: () => api.get<{ items: Chat[] }>('/chats'),
  });

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      refetch();
    });
    return unsubscribe;
  }, [navigation, refetch]);

  const chats = data?.items || [];

  const getChatTitle = (chat: Chat) => {
    if (chat.title) return chat.title;
    return chat.members
      .map((m) => `${m.user?.firstName || ''} ${m.user?.lastName || ''}`.trim())
      .filter(Boolean)
      .join(', ') || 'Chat';
  };

  const renderItem = ({ item }: { item: Chat }) => {
    const title = getChatTitle(item);
    const timeStr = item.lastMessage
      ? formatDistanceToNow(new Date(item.lastMessage.createdAt), { addSuffix: false })
      : '';

    return (
      <TouchableOpacity
        style={styles.item}
        onPress={() =>
          navigation.navigate('Chat', {
            chatId: item.id,
            title,
          })
        }
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{title[0]?.toUpperCase() || '?'}</Text>
        </View>
        <View style={styles.content}>
          <View style={styles.topRow}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.time}>{timeStr}</Text>
          </View>
          <Text style={styles.preview} numberOfLines={1}>
            {item.lastMessage?.content || 'No messages yet'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2E7CF6" />
      </View>
    );
  }

  if (chats.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>No chats yet</Text>
        <Text style={styles.emptyText}>
          Start a conversation by searching for a user.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={chats}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#161c24', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#606c7a', textAlign: 'center' },
  item: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2E7CF6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  content: { flex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  title: { fontSize: 16, fontWeight: '500', color: '#161c24', flex: 1 },
  time: { fontSize: 12, color: '#8c98a8' },
  preview: { fontSize: 14, color: '#606c7a' },
  separator: { height: 1, backgroundColor: '#e0e4e9' },
});
