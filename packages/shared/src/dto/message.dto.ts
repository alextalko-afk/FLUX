import { z } from 'zod';

export const SendMessageDto = z.object({
  chatId: z.string().uuid(),
  type: z.string(),
  content: z.string().max(4096).optional().default(''),
  mediaId: z.string().uuid().optional(),
  replyToMessageId: z.string().uuid().optional(),
  clientTempId: z.string().uuid(),
});

export const EditMessageDto = z.object({
  content: z.string().min(1).max(4096),
});

export type SendMessagePayload = z.infer<typeof SendMessageDto>;
export type EditMessagePayload = z.infer<typeof EditMessageDto>;
