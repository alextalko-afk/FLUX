import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TwoFactorService } from '../auth/two-factor.service';

/**
 * With `ADMIN_REQUIRE_2FA=1` an administrator must have two-factor sign-in
 * switched on before the admin API answers. A stolen admin password alone is
 * then not enough to reach it.
 */
@Injectable()
export class AdminTwoFactorGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = ['1', 'true'].includes(String(this.config.get('ADMIN_REQUIRE_2FA') ?? '').toLowerCase());
    if (!required) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user?.id || (await this.twoFactor.isEnabled(user.id))) return true;

    throw new ForbiddenException({
      message: 'Turn on two-factor authentication to use the admin panel.',
      code: 'ADMIN_2FA_REQUIRED',
    });
  }
}
