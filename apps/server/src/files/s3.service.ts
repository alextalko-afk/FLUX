import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash, randomUUID } from 'node:crypto';

@Injectable()
export class S3Service implements OnModuleInit {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client;
  /** Signs the links handed to browsers; differs from `client` when storage is reached through a public host name. */
  private readonly presignClient: S3Client;
  private readonly buckets: Record<string, string>;
  private readonly endpoint: string;
  private readonly forcePathStyle: boolean;

  constructor(private readonly configService: ConfigService) {
    this.endpoint = this.configService.get<string>('s3.endpoint', 'http://localhost:9000');
    this.forcePathStyle = this.configService.get<boolean>('s3.forcePathStyle', true);

    this.client = new S3Client({
      region: this.configService.get<string>('s3.region', 'us-east-1'),
      endpoint: this.endpoint,
      forcePathStyle: this.forcePathStyle,
      maxAttempts: 3,
      credentials: {
        accessKeyId: this.configService.get<string>('s3.accessKey', 'minioadmin'),
        secretAccessKey: this.configService.get<string>('s3.secretKey', 'minioadmin'),
      },
    });

    const publicEndpoint = this.configService.get<string>('s3.publicEndpoint');
    this.presignClient = publicEndpoint
      ? new S3Client({
          region: this.configService.get<string>('s3.region', 'us-east-1'),
          endpoint: publicEndpoint,
          forcePathStyle: this.forcePathStyle,
          credentials: {
            accessKeyId: this.configService.get<string>('s3.accessKey', 'minioadmin'),
            secretAccessKey: this.configService.get<string>('s3.secretKey', 'minioadmin'),
          },
        })
      : this.client;

    this.buckets = {
      avatars: this.configService.get<string>('s3.buckets.avatars', 'avatars'),
      chatMedia: this.configService.get<string>('s3.buckets.chatMedia', 'chat-media'),
      voice: this.configService.get<string>('s3.buckets.voice', 'voice'),
      video: this.configService.get<string>('s3.buckets.video', 'video'),
      stickers: this.configService.get<string>('s3.buckets.stickers', 'stickers'),
      exports: this.configService.get<string>('s3.buckets.exports', 'exports'),
      temp: this.configService.get<string>('s3.buckets.temp', 'temp'),
    };
  }

  /**
   * Ensures that every bucket the application relies on exists.
   *
   * This runs non-blocking (the promise is intentionally not awaited) so that
   * the HTTP server starts even when object storage is temporarily down — a
   * storage outage must not take the whole messenger offline. Failures are
   * logged as warnings and retried on the next process start.
   */
  onModuleInit(): void {
    void this.ensureBuckets();
  }

  private async ensureBuckets(): Promise<void> {
    const names = Array.from(new Set(Object.values(this.buckets))).filter(
      (name): name is string => typeof name === 'string' && name.length > 0,
    );

    for (const bucket of names) {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        try {
          await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
          this.logger.log(`Created S3 bucket: ${bucket}`);
        } catch (error) {
          this.logger.warn(
            `Could not ensure S3 bucket "${bucket}" at ${this.endpoint}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }
  }

  getBucketForType(mediaType: string): string {
    const map: Record<string, string> = {
      AVATAR: this.buckets.avatars || "avatars",
      CHAT_MEDIA: this.buckets.chatMedia || "chat-media",
      VOICE: this.buckets.voice || "voice",
      VIDEO: this.buckets.video || "video",
      STICKER: this.buckets.stickers || "stickers",
      EXPORT: this.buckets.exports || "exports",
      TEMP: this.buckets.temp || "temp",
    };
    return (map[mediaType] as string) || (this.buckets.chatMedia as string);
  }

  buildObjectKey(mediaType: string, fileName: string): string {
    const date = new Date();
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const id = randomUUID();
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const safeExt = ext ? `.${ext}` : '';
    return `${mediaType.toLowerCase()}/${year}/${month}/${day}/${id}${safeExt}`;
  }

  async getPresignedUploadUrl(
    bucket: string,
    key: string,
    contentType: string,
    expiresInSeconds = 600,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });

    const url = await getSignedUrl(this.presignClient, command, {
      expiresIn: expiresInSeconds,
    });

    return url;
  }

  async getPresignedDownloadUrl(
    bucket: string,
    key: string,
    expiresInSeconds = 300,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const url = await getSignedUrl(this.presignClient, command, {
      expiresIn: expiresInSeconds,
    });

    return url;
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );
    } catch (err) {
      this.logger.warn(`Failed to delete ${bucket}/${key}: ${err}`);
    }
  }

  async headObject(bucket: string, key: string): Promise<any> {
    try {
      return await this.client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );
    } catch {
      return null;
    }
  }

  /**
   * Reads an object's full contents into memory.
   *
   * Used by the thumbnail pipeline to feed Sharp. Returns `null` (rather than
   * throwing) when the object is missing or storage is unreachable, so a
   * failed derivative never breaks the code path that asked for it.
   */
  async getObjectBuffer(bucket: string, key: string): Promise<Buffer | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      const bytes = await response.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch (err) {
      this.logger.warn(`Failed to read ${bucket}/${key}: ${err}`);
      return null;
    }
  }

  /** Reads only the first bytes of an object, enough to recognise its format. */
  async getObjectHead(bucket: string, key: string, bytes = 64): Promise<Buffer | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${bytes - 1}` }),
      );
      const data = await response.Body?.transformToByteArray();
      return data ? Buffer.from(data) : null;
    } catch (err) {
      this.logger.warn(`Failed to read start of ${bucket}/${key}: ${err}`);
      return null;
    }
  }

  /** Writes an in-memory buffer to an object (used for generated thumbnails). */
  async putObject(
    bucket: string,
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  computeHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }
}
