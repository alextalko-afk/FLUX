import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, ChatType, ChatMemberRole, MessageType, MessageStatus } from '@prisma/client';

const prisma = new PrismaClient();

describe('Messages service', () => {
  let userId1: string;
  let userId2: string;
  let chatId: string;
  let voiceFileObjectId: string | null = null;

  beforeAll(async () => {
    const user1 = await prisma.user.create({
      data: {
        firstName: 'Sender',
        emails: {
          create: {
            email: `sender-${Date.now()}@example.com`,
            isPrimary: true,
            isVerified: true,
          },
        },
      },
    });
    userId1 = user1.id;

    const user2 = await prisma.user.create({
      data: {
        firstName: 'Receiver',
        emails: {
          create: {
            email: `receiver-${Date.now()}@example.com`,
            isPrimary: true,
            isVerified: true,
          },
        },
      },
    });
    userId2 = user2.id;

    const chat = await prisma.chat.create({
      data: {
        type: ChatType.PRIVATE,
        members: {
          create: [
            { userId: userId1, role: ChatMemberRole.MEMBER },
            { userId: userId2, role: ChatMemberRole.MEMBER },
          ],
        },
      },
    });
    chatId = chat.id;
  });

  afterAll(async () => {
    if (voiceFileObjectId) {
      await prisma.fileObject.delete({ where: { id: voiceFileObjectId } });
    }
    await prisma.chat.delete({ where: { id: chatId } });
    await prisma.user.delete({ where: { id: userId1 } });
    await prisma.user.delete({ where: { id: userId2 } });
  });

  it('should create a text message', async () => {
    const message = await prisma.message.create({
      data: {
        chatId,
        senderId: userId1,
        type: MessageType.TEXT,
        content: 'Hello, world!',
        status: MessageStatus.SENT,
      },
    });

    expect(message.id).toBeTruthy();
    expect(message.content).toBe('Hello, world!');
    expect(message.senderId).toBe(userId1);
  });

  it('should fetch messages for a chat', async () => {
    await prisma.message.create({
      data: {
        chatId,
        senderId: userId2,
        type: MessageType.TEXT,
        content: 'Reply message',
        status: MessageStatus.SENT,
      },
    });

    const messages = await prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: 'asc' },
    });

    expect(messages.length).toBeGreaterThanOrEqual(2);
  });

  it('should mark message as edited', async () => {
    const message = await prisma.message.create({
      data: {
        chatId,
        senderId: userId1,
        type: MessageType.TEXT,
        content: 'Original',
        status: MessageStatus.SENT,
      },
    });

    const updated = await prisma.message.update({
      where: { id: message.id },
      data: {
        content: 'Edited',
        isEdited: true,
      },
    });

    expect(updated.content).toBe('Edited');
    expect(updated.isEdited).toBe(true);
  });

  it('should soft-delete a message', async () => {
    const message = await prisma.message.create({
      data: {
        chatId,
        senderId: userId1,
        type: MessageType.TEXT,
        content: 'To be deleted',
        status: MessageStatus.SENT,
      },
    });

    await prisma.message.update({
      where: { id: message.id },
      data: { isDeleted: true, content: '' },
    });

    const deleted = await prisma.message.findUnique({ where: { id: message.id } });
    expect(deleted?.isDeleted).toBe(true);
    expect(deleted?.content).toBe('');
  });

  it('persists voice duration and waveform on the media row', async () => {
    const fileObject = await prisma.fileObject.create({
      data: {
        bucket: 'flux',
        key: `voice/${Date.now()}.webm`,
        mimeType: 'audio/webm',
        size: 8192,
        ownerId: userId1,
        mediaType: 'VOICE',
      },
    });
    voiceFileObjectId = fileObject.id;

    const message = await prisma.message.create({
      data: {
        chatId,
        senderId: userId1,
        type: MessageType.VOICE,
        content: '',
        mediaId: fileObject.id,
        status: MessageStatus.SENT,
        media: {
          create: {
            fileObjectId: fileObject.id,
            url: `/api/v1/media/download/${fileObject.id}`,
            mimeType: fileObject.mimeType,
            size: fileObject.size,
            duration: 7,
            waveform: [0.1, 0.5, 1],
          },
        },
      },
      include: { media: true },
    });

    expect(message.type).toBe(MessageType.VOICE);
    expect(message.media?.duration).toBe(7);
    expect(message.media?.waveform).toEqual([0.1, 0.5, 1]);
  });
});
