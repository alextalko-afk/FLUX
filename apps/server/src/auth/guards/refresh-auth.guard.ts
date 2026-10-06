import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenService } from '../token.service';

@Injectable()
export class RefreshAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const refreshToken = request.cookies?.refresh_token;

    if (!refreshToken) {
      throw new UnauthorizedException({
        message: 'Refresh token is missing.',
        code: 'REFRESH_TOKEN_MISSING',
      });
    }

    const tokenHash = this.tokenService.hashToken(refreshToken);
    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { token: tokenHash },
    });

    if (!tokenRecord || tokenRecord.isRevoked || tokenRecord.expiresAt < new Date()) {
      throw new UnauthorizedException({
        message: 'Refresh token is invalid or expired.',
        code: 'REFRESH_TOKEN_INVALID',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: tokenRecord.userId },
    });

    if (!user || user.isBlocked) {
      throw new UnauthorizedException({
        message: 'User is unavailable.',
        code: 'USER_UNAVAILABLE',
      });
    }

    request.user = {
      id: user.id,
      role: user.role,
    };
    request.refreshTokenId = tokenRecord.id;

    return true;
  }
}
