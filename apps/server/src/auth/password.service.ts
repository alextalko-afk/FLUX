import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordService {
  constructor(private readonly configService: ConfigService) {}

  private getOptions(): any {
    const memoryCost = this.configService.get<number>('argon2.memoryCost', 65536);
    const timeCost = this.configService.get<number>('argon2.timeCost', 3);
    const parallelism = this.configService.get<number>('argon2.parallelism', 4);
    const pepper = this.configService.get<string>('argon2.pepper', '');

    const options: any = {
      type: argon2.argon2id,
      memoryCost,
      timeCost,
      parallelism,
    };

    if (pepper) {
      options.secret = Buffer.from(pepper, 'utf8');
    }

    return options;
  }

  async hash(password: string): Promise<string> {
    return (await argon2.hash(password, this.getOptions())) as unknown as string;
  }

  async verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password, this.getOptions());
  }
}
