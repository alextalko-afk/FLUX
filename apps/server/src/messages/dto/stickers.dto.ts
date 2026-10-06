import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateNested } from 'class-validator';

export class StickerInputDto {
  @IsUUID() fileObjectId!: string;
  @IsString() @MinLength(1) @MaxLength(16) emoji!: string;
}

export class CreateStickerPackDto {
  @IsString() @MinLength(1) @MaxLength(64) title!: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(60) @ValidateNested({ each: true }) @Type(() => StickerInputDto)
  stickers!: StickerInputDto[];
}

export class SendStickerDto {
  @IsUUID() stickerId!: string;
  @IsOptional() @IsUUID() replyToMessageId?: string;
}
