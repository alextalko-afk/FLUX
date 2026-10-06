import { describe, it, expect } from 'vitest';
import { S3Service } from '../../../apps/server/src/files/s3.service';

const service = (values: Record<string, unknown>) =>
  new S3Service({ get: (key: string, fallback?: unknown) => values[key] ?? fallback } as any);

const base = { 's3.endpoint': 'http://seaweedfs:9000', 's3.accessKey': 'key', 's3.secretKey': 'secret', 's3.forcePathStyle': true };

describe('presigned links', () => {
  it('are signed for the storage endpoint by default', async () => {
    const url = await service(base).getPresignedDownloadUrl('chat-media', 'a/b.png');
    expect(url.startsWith('http://seaweedfs:9000/chat-media/a/b.png?')).toBe(true);
    expect(url).toContain('X-Amz-Signature=');
  });

  it('use the public endpoint when one is set, for uploads and downloads', async () => {
    const s3 = service({ ...base, 's3.publicEndpoint': 'https://s3.example.com' });
    expect((await s3.getPresignedDownloadUrl('chat-media', 'a/b.png')).startsWith('https://s3.example.com/chat-media/a/b.png?')).toBe(true);
    expect((await s3.getPresignedUploadUrl('chat-media', 'a/b.png', 'image/png')).startsWith('https://s3.example.com/chat-media/a/b.png?')).toBe(true);
  });
});
