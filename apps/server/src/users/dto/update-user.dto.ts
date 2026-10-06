import {
  IsInt,
  IsOptional,
  Max,
  Min,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  lastName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{3,32}$/, {
    message: 'Username can only contain letters, numbers and underscores, length 3-32',
  })
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  statusEmoji?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 30)
  statusHours?: number;
}
