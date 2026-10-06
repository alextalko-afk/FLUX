import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { CallType } from '@FLUX/shared';

export class InitiateCallDto {
  @IsUUID()
  targetUserId!: string;

  @IsEnum(CallType)
  type!: CallType;
}

export class CallSignalDto {
  @IsUUID()
  callId!: string;

  @IsString()
  signalType!: string;

  @IsOptional()
  sdp?: string;

  @IsOptional()
  candidate?: string;
}

export class CallHistoryQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  limit?: number;
}
