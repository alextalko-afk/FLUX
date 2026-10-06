import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ChatMemberRole, ChatType } from '@FLUX/shared';

export class CreatePrivateChatDto {
  @IsUUID()
  targetUserId!: string;
}

export class CreateGroupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  memberIds!: string[];

  @IsOptional()
  @IsBoolean()
  e2ee?: boolean;
}

export class CreateChannelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class UpdateChatDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  /** Minimum seconds between two messages of an ordinary member; 0 turns slow mode off. */
  @IsOptional()
  @IsIn([0, 10, 30, 60, 300, 900, 3600])
  slowModeSeconds?: number;

  /** New members arriving through the invite link wait for an admin to approve them. */
  @IsOptional()
  @IsBoolean()
  joinApproval?: boolean;

  /** Turns a group into a forum with topics. */
  @IsOptional()
  @IsBoolean()
  isForum?: boolean;

  /** Lets channel members comment under posts. */
  @IsOptional()
  @IsBoolean()
  commentsEnabled?: boolean;
}

export class AddMembersDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  userIds!: string[];
}

export class UpdateMemberDto {
  @IsEnum(ChatMemberRole)
  role!: ChatMemberRole;
}

export class SetMutedDto {
  @IsBoolean()
  isMuted!: boolean;
}

export class SetPinnedDto {
  @IsBoolean()
  isPinned!: boolean;
}

export class SetArchivedDto {
  @IsBoolean()
  isArchived!: boolean;
}

export class ChatListQueryDto {
  @IsOptional()
  @IsEnum(ChatType)
  type?: ChatType;

  /** `true` lists the caller's archived chats instead of the main list. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  archived?: boolean;

  /** Only chats placed in this folder (which must belong to the caller). */
  @IsOptional()
  @IsUUID()
  folderId?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  limit?: number;
}

export class CreateSecretChatDto {
  @IsUUID()
  targetUserId!: string;

  /** The caller's own device key, as registered through `POST /security/devices`. */
  @IsUUID()
  deviceKeyId!: string;
}
