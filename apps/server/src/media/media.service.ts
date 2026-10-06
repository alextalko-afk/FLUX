import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../files/s3.service';
import { InitUploadDto, CompleteUploadDto } from './dto/media.dto';
import { MediaType, RealtimeEvent } from '@FLUX/shared';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type { FileObject } from '@prisma/client';
import sharp from 'sharp';
import {
  THUMBNAIL_MAX_DIMENSION,
  THUMBNAIL_QUALITY,
  isThumbnailableImage,
  thumbnailObjectKey,
} from './media.thumbnail';

export type MediaVariant = 'original' | 'thumb';

/**
 * Largest object whose bytes are read back from storage to compute a sha256
 * content hash. Above this the hash is left `NULL` rather than spending a
 * full download per upload.
 */
export const HASHABLE_MAX_SIZE = 8 * 1024 * 1024;

import { AntivirusService } from './antivirus.service';
import { contentMatchesType } from './content-sniff';
import { FfmpegService } from './ffmpeg.service';
import { SettingsService } from '../settings/settings.service';
import { isPosterableVideo, isProbeable } from './media.probe';

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
]);

const ALLOWED_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
]);

const ALLOWED_AUDIO_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/aac',
  'audio/flac',
  'audio/x-m4a',
]);

const ALLOWED_DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/zip',
  'application/x-rar-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/json',
]);

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly configService: ConfigService,
    private readonly realtime: RealtimeGateway,
    private readonly antivirus: AntivirusService,
    private readonly ffmpeg: FfmpegService,
    private readonly settings: SettingsService,
  ) {
  }

  /** The upload limit in effect: the admin setting, falling back to `UPLOAD_MAX_SIZE_MB`. */
  private async maxSizeBytes(): Promise<number> {
    return (await this.settings.get<number>('maxUploadMb')) * 1024 * 1024;
  }

  private isAllowedMimeType(mimeType: string): boolean {
    const normalized = mimeType.toLowerCase();
    return (
      ALLOWED_IMAGE_TYPES.has(normalized) ||
      ALLOWED_VIDEO_TYPES.has(normalized) ||
      ALLOWED_AUDIO_TYPES.has(normalized) ||
      ALLOWED_DOCUMENT_TYPES.has(normalized)
    );
  }

  /**
   * Measures duration and frame size with ffprobe and stores them on the `FileObject`, once.
   * Never throws; without FFmpeg the values stay empty and clients keep sending their own.
   */
  private async ensureMediaInfo(fileObject: FileObject): Promise<{ durationSec: number | null; width: number | null; height: number | null }> {
    const known = { durationSec: fileObject.durationSec, width: fileObject.width, height: fileObject.height };
    if (known.durationSec !== null || !isProbeable(fileObject.mimeType) || !this.ffmpeg.isEnabled()) return known;

    const source = await this.s3.getObjectBuffer(fileObject.bucket, fileObject.key);
    if (!source) return known;
    const info = await this.ffmpeg.probe(source, fileObject.mimeType);
    if (!info) return known;
    await this.prisma.fileObject.update({ where: { id: fileObject.id }, data: info }).catch(() => undefined);
    return info;
  }

  private getMediaCategory(mimeType: string): 'image' | 'video' | 'audio' | 'document' {
    const normalized = mimeType.toLowerCase();
    if (ALLOWED_IMAGE_TYPES.has(normalized)) return 'image';
    if (ALLOWED_VIDEO_TYPES.has(normalized)) return 'video';
    if (ALLOWED_AUDIO_TYPES.has(normalized)) return 'audio';
    return 'document';
  }

  /**
   * Generates a JPEG preview for a chat image, once, and records its key on the
   * `FileObject`. Returns the thumbnail key or `null`.
   *
   * Never throws: thumbnails are an optimisation, so a decode/storage failure
   * must not fail the upload that triggered it.
   */
  private async ensureThumbnail(fileObject: FileObject): Promise<string | null> {
    if (fileObject.thumbnailKey) return fileObject.thumbnailKey;
    // Avatars have their own (owner-only) download path; no preview needed.
    if (fileObject.mediaType === MediaType.AVATAR) return null;
    const video = isPosterableVideo(fileObject.mimeType);
    if (!video && !isThumbnailableImage(fileObject.mimeType)) return null;
    if (video && !this.ffmpeg.isEnabled()) return null;

    const source = await this.s3.getObjectBuffer(fileObject.bucket, fileObject.key);
    if (!source) return null;

    try {
      // A video's poster is a still frame from FFmpeg, then goes through the same resize as an image.
      const frame = video ? await this.ffmpeg.videoPoster(source, fileObject.mimeType) : source;
      if (!frame) return null;
      const buffer = await sharp(frame)
        // Honour the EXIF orientation before downscaling, otherwise previews of
        // phone photos come out rotated.
        .rotate()
        .resize({
          width: THUMBNAIL_MAX_DIMENSION,
          height: THUMBNAIL_MAX_DIMENSION,
          fit: 'inside',
          withoutEnlargement: true,
        })
        // JPEG has no alpha channel; flatten onto white so transparent PNGs and
        // WebPs do not come out with black corners.
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: THUMBNAIL_QUALITY })
        .toBuffer();

      const key = thumbnailObjectKey(fileObject.key);
      await this.s3.putObject(fileObject.bucket, key, buffer, 'image/jpeg');
      await this.prisma.fileObject.update({
        where: { id: fileObject.id },
        data: { thumbnailKey: key },
      });

      return key;
    } catch (err) {
      this.logger.warn(
        `Thumbnail generation failed for ${fileObject.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  /**
   * Fills `FileObject.hash` with the sha256 of the stored object so identical
   * uploads can be recognised and integrity can be checked later.
   *
   * Bounded on purpose: only objects small enough to pull through the API
   * cheaply are buffered, so a 50 MB video is never downloaded just to be
   * hashed. Larger objects keep a `NULL` hash. Never throws — a missing hash
   * must not fail an upload that otherwise succeeded.
   */
  private async ensureContentHash(fileObject: FileObject): Promise<string | null> {
    if (fileObject.hash) return fileObject.hash;
    if (fileObject.size > HASHABLE_MAX_SIZE) return null;

    try {
      const source = await this.s3.getObjectBuffer(fileObject.bucket, fileObject.key);
      if (!source) return null;

      const hash = this.s3.computeHash(source);
      await this.prisma.fileObject.update({
        where: { id: fileObject.id },
        data: { hash },
      });

      return hash;
    } catch (err) {
      this.logger.warn(
        `Hashing failed for ${fileObject.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  async initUpload(userId: string, dto: InitUploadDto) {
    const size = Number(dto.fileSize);
    if (!Number.isFinite(size) || size <= 0) {
      throw new BadRequestException({
        message: 'Invalid file size.',
        code: 'INVALID_FILE_SIZE',
      });
    }

    const maxBytes = await this.maxSizeBytes();
    if (size > maxBytes) {
      throw new BadRequestException({
        message: `File is too large. Max ${Math.floor(maxBytes / 1024 / 1024)}MB.`,
        code: 'FILE_TOO_LARGE',
      });
    }

    if (!this.isAllowedMimeType(dto.mimeType)) {
      throw new BadRequestException({
        message: 'Unsupported file type.',
        code: 'UNSUPPORTED_FILE_TYPE',
      });
    }

    if (dto.chatId) {
      const member = await this.prisma.chatMember.findFirst({
        where: { chatId: dto.chatId, userId },
      });
      if (!member) {
        throw new ForbiddenException({
          message: 'Not a member of this chat.',
          code: 'NOT_CHAT_MEMBER',
        });
      }
    }

    const bucket = this.s3.getBucketForType(dto.mediaType);
    const key = this.s3.buildObjectKey(dto.mediaType, dto.fileName);

    const fileObject = await this.prisma.fileObject.create({
      data: {
        bucket,
        key,
        mimeType: dto.mimeType,
        size,
        // Persisted so `completeUpload` can tell an avatar from a chat
        // attachment and so downloads can be authorised later.
        ownerId: userId,
        mediaType: dto.mediaType,
      },
    });

    const uploadUrl = await this.s3.getPresignedUploadUrl(
      bucket,
      key,
      dto.mimeType,
      600,
    );

    return {
      fileObjectId: fileObject.id,
      uploadUrl,
      bucket,
      key,
      expiresIn: 600,
    };
  }

  /** Deletes the upload and refuses it when ClamAV finds a virus, or cannot run while it is required. */
  private async scanForViruses(fileObject: { id: string; bucket: string; key: string }): Promise<void> {
    if (!this.antivirus.isEnabled) return;

    const body = await this.s3.getObjectBuffer(fileObject.bucket, fileObject.key);
    const result = body ? await this.antivirus.scan(body) : ({ status: 'unavailable' } as const);

    if (result.status === 'infected') {
      this.logger.warn(`Upload ${fileObject.id} rejected: ${result.signature}`);
    } else if (result.status === 'unavailable' && this.antivirus.isRequired) {
      throw new BadRequestException({
        message: 'The file could not be checked for viruses. Try again later.',
        code: 'UPLOAD_SCAN_UNAVAILABLE',
      });
    } else {
      return;
    }

    await this.s3.deleteObject(fileObject.bucket, fileObject.key);
    await this.prisma.fileObject.delete({ where: { id: fileObject.id } }).catch(() => undefined);
    throw new BadRequestException({
      message: 'The file was blocked: it contains a virus.',
      code: 'UPLOAD_INFECTED',
    });
  }

  async completeUpload(userId: string, dto: CompleteUploadDto) {
    const fileObject = await this.prisma.fileObject.findUnique({
      where: { id: dto.fileObjectId },
    });

    if (!fileObject) {
      throw new NotFoundException({
        message: 'File object not found.',
        code: 'FILE_NOT_FOUND',
      });
    }

    // Only the person who started the upload may finish it.
    if (fileObject.ownerId !== userId) {
      throw new NotFoundException({
        message: 'File object not found.',
        code: 'FILE_NOT_FOUND',
      });
    }

    const head = await this.s3.headObject(fileObject.bucket, fileObject.key);
    if (!head) {
      throw new BadRequestException({
        message: 'File was not uploaded.',
        code: 'FILE_NOT_UPLOADED',
      });
    }

    // The presigned URL cannot enforce the size, so it is checked here, and the
    // real content must fit the declared type. Anything else is deleted.
    const stored = Number(head.ContentLength ?? 0);
    const start = await this.s3.getObjectHead(fileObject.bucket, fileObject.key);
    if (stored > (await this.maxSizeBytes()) || stored !== fileObject.size || !start || !contentMatchesType(fileObject.mimeType, start)) {
      await this.s3.deleteObject(fileObject.bucket, fileObject.key);
      await this.prisma.fileObject.delete({ where: { id: fileObject.id } }).catch(() => undefined);
      throw new BadRequestException({
        message: 'The file does not match its declared type or size.',
        code: 'UPLOAD_CONTENT_MISMATCH',
      });
    }

    await this.scanForViruses(fileObject);

    const category = this.getMediaCategory(fileObject.mimeType);
    const url = `/api/v1/media/download/${fileObject.id}`;

    // Generate (or reuse) the preview before responding so the client can
    // render a lightweight placeholder/poster straight away.
    const thumbnailKey = await this.ensureThumbnail(fileObject);
    const hash = await this.ensureContentHash(fileObject);
    const info = await this.ensureMediaInfo(fileObject);

    // An avatar is not a chat attachment: it has no message to hang off, so it
    // is linked straight to the profile. Without this the file was uploaded
    // successfully and then silently discarded.
    if (fileObject.mediaType === MediaType.AVATAR && fileObject.ownerId) {
      const user = await this.prisma.user.update({
        where: { id: fileObject.ownerId },
        data: { avatarUrl: url },
        select: { id: true, avatarUrl: true },
      });

      this.realtime.emitToUser(fileObject.ownerId, RealtimeEvent.USER_PROFILE_UPDATED, user);
    }

    return {
      fileObjectId: fileObject.id,
      url,
      thumbnailUrl: thumbnailKey ? `${url}?thumb=1` : null,
      mimeType: fileObject.mimeType,
      size: fileObject.size,
      category,
      duration: info.durationSec,
      width: info.width,
      height: info.height,
      /** Null for objects too large to hash on upload; see HASHABLE_MAX_SIZE. */
      hash,
    };
  }

  async getDownloadUrl(
    userId: string,
    fileObjectId: string,
    variant: MediaVariant = 'original',
  ) {
    const fileObject = await this.prisma.fileObject.findUnique({
      where: { id: fileObjectId },
      include: {
        media: {
          include: {
            message: {
              include: {
                chat: {
                  include: {
                    members: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!fileObject) {
      throw new NotFoundException({
        message: 'File not found.',
        code: 'FILE_NOT_FOUND',
      });
    }

    // `?thumb=1` resolves to the generated preview when one exists, otherwise
    // it transparently falls back to the original object.
    const resolvedKey =
      variant === 'thumb' && fileObject.thumbnailKey
        ? fileObject.thumbnailKey
        : fileObject.key;

    if (fileObject.bucket === this.s3.getBucketForType('AVATAR')) {
      // Avatars are shown all over the UI, but a signed URL still has to be
      // handed out deliberately: only the owner may mint one.
      if (fileObject.ownerId && fileObject.ownerId !== userId) {
        throw new ForbiddenException({
          message: 'Not your avatar.',
          code: 'NOT_AVATAR_OWNER',
        });
      }

      const url = await this.s3.getPresignedDownloadUrl(
        fileObject.bucket,
        resolvedKey,
        300,
      );
      return { url };
    }

    if (fileObject.media && fileObject.media.length > 0) {
      const chat = fileObject.media[0].message?.chat;
      if (chat) {
        const isMember = chat && chat.members.some((m: any) => m.userId === userId);
        if (!isMember) {
          throw new ForbiddenException({
            message: 'Access denied.',
            code: 'ACCESS_DENIED',
          });
        }
      }
    }

    const url = await this.s3.getPresignedDownloadUrl(
      fileObject.bucket,
      resolvedKey,
      300,
    );

    return { url };
  }

  async deleteFileObject(fileObjectId: string): Promise<void> {
    const fileObject = await this.prisma.fileObject.findUnique({
      where: { id: fileObjectId },
    });

    if (!fileObject) return;

    await this.s3.deleteObject(fileObject.bucket, fileObject.key);
    await this.prisma.fileObject.delete({ where: { id: fileObjectId } });
  }
}
