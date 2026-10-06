import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'net';

export type ScanResult =
  | { status: 'clean' }
  | { status: 'infected'; signature: string }
  | { status: 'unavailable' }
  | { status: 'disabled' };

const CHUNK = 64 * 1024;
const TIMEOUT_MS = 30_000;

/**
 * Virus scanning of uploads through a ClamAV daemon (clamd).
 *
 * Off unless `CLAMAV_HOST` is set. With `CLAMAV_REQUIRED=1` an upload is refused
 * whenever the scanner cannot be reached, otherwise it is let through with a
 * warning, so a stopped scanner does not take uploads down in development.
 */
@Injectable()
export class AntivirusService {
  private readonly logger = new Logger(AntivirusService.name);

  constructor(private readonly config: ConfigService) {}

  get isRequired(): boolean {
    return ['1', 'true'].includes(String(this.config.get('CLAMAV_REQUIRED') ?? '').toLowerCase());
  }

  get isEnabled(): boolean {
    return Boolean(this.config.get('CLAMAV_HOST'));
  }

  async scan(data: Buffer): Promise<ScanResult> {
    const host = this.config.get<string>('CLAMAV_HOST');
    if (!host) return { status: 'disabled' };
    const port = Number(this.config.get('CLAMAV_PORT') ?? 3310) || 3310;

    try {
      return parseReply(await this.instream(host, port, data));
    } catch (error) {
      this.logger.warn(`ClamAV scan failed: ${error}`);
      return { status: 'unavailable' };
    }
  }

  /** clamd INSTREAM: length-prefixed chunks, then a zero-length chunk; the reply is one line. */
  private instream(host: string, port: number, data: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      const chunks: Buffer[] = [];
      socket.setTimeout(TIMEOUT_MS, () => socket.destroy(new Error('timeout')));
      socket.on('data', (chunk) => chunks.push(chunk));
      socket.on('error', reject);
      socket.on('close', () => resolve(Buffer.concat(chunks).toString('utf8')));

      socket.connect(port, host, () => {
        socket.write('zINSTREAM\0');
        for (let offset = 0; offset < data.length; offset += CHUNK) {
          const part = data.subarray(offset, offset + CHUNK);
          const size = Buffer.alloc(4);
          size.writeUInt32BE(part.length);
          socket.write(size);
          socket.write(part);
        }
        socket.write(Buffer.alloc(4));
      });
    });
  }
}

/** Turns clamd's one-line answer ("stream: OK", "stream: Name FOUND", "... ERROR") into a result. */
export function parseReply(reply: string): ScanResult {
  const line = reply.replace(/\0/g, '').trim();
  if (/\bOK$/.test(line)) return { status: 'clean' };
  const found = /^stream:\s*(.+)\s+FOUND$/.exec(line);
  if (found) return { status: 'infected', signature: found[1] };
  return { status: 'unavailable' };
}
