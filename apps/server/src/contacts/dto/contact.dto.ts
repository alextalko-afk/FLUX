import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class AddContactDto {
  @IsOptional()
  @IsUUID()
  targetId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{3,32}$/, {
    message: 'Username can only contain letters, numbers and underscores, length 3-32',
  })
  targetUsername?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/, {
    message: 'Phone must contain 7-15 digits and may start with +',
  })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;
}

export class UpdateContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;

  @IsOptional()
  @IsBoolean()
  isFavorite?: boolean;
}
