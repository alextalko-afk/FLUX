import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mediaExtension, parseProbeOutput, ProbeResult } from './media.probe';

export type RunFn = (file: string, args: string[], timeoutMs: number) => Promise<string>;

const defaultRun: RunFn = (file, args, timeoutMs) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, windowsHide: true, env: { PATH: process.env.PATH ?? '' } },
      (err, stdout) => (err ? reject(err) : resolve(stdout)),
    );
  });

/**
 * Adapter around the `ffmpeg` and `ffprobe` binaries (`FFMPEG_PATH`, `FFPROBE_PATH`, default: on PATH).
 *
 * Without them the adapter switches itself off and every method returns `null`: media still
 * uploads and plays, it just has no server-measured duration or video poster.
 *
 * The input is untrusted, so: arguments are passed as an array (no shell), the temp file name is
 * fixed, only the `file` protocol may be opened (no playlists pulling in URLs), and each run has a timeout.
 */
@Injectable()
export class FfmpegService implements OnModuleInit {
  private readonly logger = new Logger(FfmpegService.name);
  private enabled = false;
  private readonly ffmpeg: string;
  private readonly ffprobe: string;
  private readonly timeoutMs: number;
  /** Replaceable in tests. */
  protected run: RunFn = defaultRun;

  constructor(config: ConfigService) {
    this.ffmpeg = config.get<string>('FFMPEG_PATH') || 'ffmpeg';
    this.ffprobe = config.get<string>('FFPROBE_PATH') || 'ffprobe';
    this.timeoutMs = Number(config.get<string>('FFMPEG_TIMEOUT_MS')) || 30_000;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.run(this.ffmpeg, ['-version'], 5000);
      await this.run(this.ffprobe, ['-version'], 5000);
      this.enabled = true;
    } catch {
      this.logger.warn('ffmpeg/ffprobe not found: video posters and media probing are off.');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Duration and frame size as measured from the file itself. */
  async probe(data: Buffer, mimeType: string): Promise<ProbeResult | null> {
    return this.withInput(data, mimeType, async (input) => {
      const out = await this.run(
        this.ffprobe,
        ['-v', 'error', '-protocol_whitelist', 'file', '-print_format', 'json', '-show_format', '-show_streams', input],
        this.timeoutMs,
      );
      return parseProbeOutput(out);
    });
  }

  /** A JPEG frame (longest edge 480 px) from the first second of a video. */
  async videoPoster(data: Buffer, mimeType: string): Promise<Buffer | null> {
    return this.withInput(data, mimeType, async (input, dir) => {
      const output = join(dir, 'poster.jpg');
      const attempt = async (seek: string) => {
        await this.run(
          this.ffmpeg,
          [
            '-nostdin', '-v', 'error', '-protocol_whitelist', 'file',
            '-ss', seek, '-i', input,
            '-frames:v', '1',
            '-vf', 'scale=480:480:force_original_aspect_ratio=decrease',
            '-q:v', '4', '-y', output,
          ],
          this.timeoutMs,
        );
        return readFile(output);
      };
      try {
        return await attempt('1');
      } catch {
        // Clips shorter than a second have no frame at the 1 s mark.
        return attempt('0');
      }
    });
  }

  private async withInput<T>(data: Buffer, mimeType: string, fn: (input: string, dir: string) => Promise<T>): Promise<T | null> {
    const ext = mediaExtension(mimeType);
    if (!this.enabled || !ext) return null;
    let dir: string | undefined;
    try {
      dir = await mkdtemp(join(tmpdir(), 'flux-media-'));
      const input = join(dir, `input.${ext}`);
      await writeFile(input, data);
      return await fn(input, dir);
    } catch (err) {
      this.logger.warn(`ffmpeg processing failed: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
      return null;
    } finally {
      if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
