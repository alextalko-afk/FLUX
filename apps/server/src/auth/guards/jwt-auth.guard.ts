import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenService } from '../token.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization;

    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        message: 'Access token is missing.',
        code: 'ACCESS_TOKEN_MISSING',
      });
    }

    const token = authorization.slice(7);
    const payload = this.tokenService.verifyAccessToken(token);

    const [user, session] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: payload.sub } }),
      payload.sessionId
        ? this.prisma.session.findUnique({
            where: { id: payload.sessionId },
            select: { userId: true, isActive: true },
          })
        : null,
    ]);

    if (!user || user.isBlocked || user.deletedAt) {
      throw new UnauthorizedException({
        message: 'User is unavailable.',
        code: 'USER_UNAVAILABLE',
      });
    }

    // An access token outlives its session by up to its TTL. Checking the
    // session on every request is what makes "sign out of this device" and
    // "sign out everywhere" take effect immediately instead of after expiry.
    if (!session || !session.isActive || session.userId !== user.id) {
      throw new UnauthorizedException({
        message: 'Session has ended.',
        code: 'SESSION_REVOKED',
      });
    }

    request.user = {
      id: user.id,
      role: user.role,
      sessionId: payload.sessionId,
    };

    return true;
  }
}
