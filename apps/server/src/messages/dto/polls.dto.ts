import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreatePollDto {
  @IsString() @MinLength(1) @MaxLength(300)
  question!: string;

  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(100, { each: true })
  options!: string[];

  @IsOptional() @IsBoolean() isAnonymous?: boolean;
  @IsOptional() @IsBoolean() multiple?: boolean;
  @IsOptional() @IsBoolean() isQuiz?: boolean;

  @IsOptional() @IsInt() @Min(0) @Max(9)
  correctOption?: number;

  @IsOptional() @IsString() @MaxLength(200)
  explanation?: string;

  @IsOptional() @IsDateString()
  closesAt?: string;
}

export class VotePollDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @IsUUID('all', { each: true })
  optionIds!: string[];
}
