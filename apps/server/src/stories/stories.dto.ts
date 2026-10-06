import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateStoryDto {
  @IsUUID() fileObjectId!: string;
  @IsOptional() @IsString() @MaxLength(200) caption?: string;
}
