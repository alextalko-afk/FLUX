import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class RegisterDeviceDto {
  /** Base64 (standard alphabet, padded) X25519 public key: exactly 32 bytes. */
  @IsString()
  @Matches(/^[A-Za-z0-9+/]{43}=$/, { message: 'publicKey must be a base64 encoded 32-byte key' })
  publicKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;
}
