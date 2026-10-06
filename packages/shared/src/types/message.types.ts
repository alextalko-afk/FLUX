export interface IMessageEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
}

export interface IMessageMedia {
  id: string;
  url: string;
  thumbnailUrl?: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  waveform?: number[];
  fileName?: string;
}

export interface IMessage {
  id: string;
  chatId: string;
  senderId: string;
  type: string;
  content: string;
  entities: IMessageEntity[];
  media: IMessageMedia | null;
  replyToMessageId: string | null;
  forwardedFromChatId: string | null;
  forwardedFromMessageId: string | null;
  isEdited: boolean;
  isDeleted: boolean;
  viewsCount: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMessagePreview {
  id: string;
  senderId: string;
  type: string;
  content: string;
  createdAt: Date;
}
