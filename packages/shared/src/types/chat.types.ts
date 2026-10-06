export interface IChat {
  id: string;
  type: string;
  title: string | null;
  avatarUrl: string | null;
  description: string | null;
  isPublic: boolean;
  inviteLink: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IChatMember {
  userId: string;
  chatId: string;
  role: string;
  joinedAt: Date;
  isMuted: boolean;
  mutedUntil: Date | null;
}

export interface IChatWithDetails extends IChat {
  members: IChatMember[];
  lastMessage: any | null;
  unreadCount: number;
  isPinned: boolean;
  isArchived: boolean;
  isMuted: boolean;
  draft: string | null;
}
