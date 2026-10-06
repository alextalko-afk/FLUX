export interface ChatMember {
  id: string;
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  isMuted: boolean;
  user: {
    id: string;
    username: string | null;
    firstName: string;
    lastName: string | null;
    avatarUrl: string | null;
    presence: string;
    lastSeenAt: string | null;
  };
}

export interface ChatDetails {
  id: string;
  type: 'PRIVATE' | 'GROUP' | 'CHANNEL' | 'SAVED';
  title: string | null;
  avatarUrl: string | null;
  description: string | null;
  createdAt: string;
  members: ChatMember[];
  _count?: { messages: number };
}

export interface SearchedUser {
  id: string;
  firstName: string;
  lastName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
}
