import { describe, it, expect } from 'vitest';
import { createServer } from 'net';
import { AntivirusService, parseReply } from '../../../apps/server/src/media/antivirus.service';

const config = (values: Record<string, string>) => ({ get: (key: string) => values[key] }) as any;

describe('antivirus reply parsing', () => {
  it('understands clamd answers', () => {
    expect(parseReply('stream: OK\0')).toEqual({ status: 'clean' });
    expect(parseReply('stream: Win.Test.EICAR_HDB-1 FOUND\0')).toEqual({ status: 'infected', signature: 'Win.Test.EICAR_HDB-1' });
    expect(parseReply('INSTREAM size limit exceeded. ERROR\0').status).toBe('unavailable');
    expect(parseReply('').status).toBe('unavailable');
  });
});

describe('antivirus client', () => {
  it('is disabled without a host', async () => {
    const service = new AntivirusService(config({}));
    expect(service.isEnabled).toBe(false);
    expect((await service.scan(Buffer.from('x'))).status).toBe('disabled');
  });

  it('streams the file to clamd and reads the verdict', async () => {
    let received = Buffer.alloc(0);
    const server = createServer((socket) => {
      socket.on('data', (chunk) => {
        received = Buffer.concat([received, chunk]);
        if (received.subarray(-4).equals(Buffer.alloc(4))) {
          socket.end(received.includes('EICAR') ? 'stream: Eicar-Test-Signature FOUND\0' : 'stream: OK\0');
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as any).port;
    const service = new AntivirusService(config({ CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: String(port) }));

    expect(await service.scan(Buffer.from('hello'))).toEqual({ status: 'clean' });
    expect(await service.scan(Buffer.from('X5O!P%@AP EICAR'))).toEqual({ status: 'infected', signature: 'Eicar-Test-Signature' });
    expect(received.subarray(0, 0).length).toBe(0);
    server.close();
  });

  it('reports unavailable when nothing listens', async () => {
    const service = new AntivirusService(config({ CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: '1' }));
    expect((await service.scan(Buffer.from('x'))).status).toBe('unavailable');
  });
});
