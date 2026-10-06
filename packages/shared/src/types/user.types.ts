export interface IUser {
  id: string;
  email: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  role: string;
  isVerified: boolean;
  isBlocked: boolean;
  presence: string;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserPublicProfile {
  id: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  presence: string;
  lastSeenAt: Date | null;
}
