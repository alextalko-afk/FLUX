import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { normalizeUserText } from '../../common/utils/sanitize-text';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? normalizeUserText(value).trim() : value;

export class CreateFolderDto {
  @IsString()
  @Transform(trimmed)
  @MinLength(1)
  @MaxLength(32)
  name!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  chatIds?: string[];
}

export class UpdateFolderDto {
  @IsOptional()
  @IsString()
  @Transform(trimmed)
  @MinLength(1)
  @MaxLength(32)
  name?: string;

  /** The complete list of chats in the folder; omit to leave it unchanged. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  chatIds?: string[];
}

export class ReorderFoldersDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  folderIds!: string[];
}
