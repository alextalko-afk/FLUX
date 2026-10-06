import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ChatsListScreen } from './ChatsListScreen';
import { ContactsScreen } from './ContactsScreen';
import { SettingsScreen } from './SettingsScreen';
import { Text } from 'react-native';

const Tab = createBottomTabNavigator();

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#2E7CF6',
        tabBarInactiveTintColor: '#606c7a',
        headerStyle: { backgroundColor: '#fff' },
        headerTitleStyle: { color: '#161c24', fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Chats"
        component={ChatsListScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Text style={{ color, fontSize: size }}>💬</Text>,
        }}
      />
      <Tab.Screen
        name="Contacts"
        component={ContactsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Text style={{ color, fontSize: size }}>👥</Text>,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Text style={{ color, fontSize: size }}>⚙️</Text>,
        }}
      />
    </Tab.Navigator>
  );
}
