import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { MediaType } from '@FLUX/shared';

export class InitUploadDto {
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @MaxLength(100)
  mimeType!: string;

  @IsString()
  fileSize!: string;

  @IsEnum(MediaType)
  mediaType!: MediaType;

  @IsOptional()
  @IsUUID()
  chatId?: string;
}

export class CompleteUploadDto {
  @IsUUID()
  fileObjectId!: string;
}

export class GetPresignedDownloadDto {
  @IsUUID()
  fileObjectId!: string;
}
