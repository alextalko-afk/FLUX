import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor.service';
import { QrLoginService } from './qr-login.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshAuthGuard } from './guards/refresh-auth.guard';
import { CsrfGuard } from '../security/csrf.guard';
import { CsrfService } from '../security/csrf.service';
import { clearCsrfCookie, setCsrfCookie } from '../security/csrf-cookie';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  ForgotPasswordDto,
  LoginDto,
  QrCompleteDto,
  QrTokenDto,
  RegisterDto,
  ResendVerificationDto,
  ResetPasswordDto,
  TwoFactorEnableDto,
  TwoFactorVerifyDto,
  VerifyEmailDto,
} from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly twoFactorService: TwoFactorService,
    private readonly csrf: CsrfService,
    private readonly qrLogin: QrLoginService,
  ) {}

  private get cookieSecure(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  private setRefreshCookie(res: Response, token: string, maxAgeMs: number): void {
    res.cookie('refresh_token', token, {
      httpOnly: true,
      secure: this.cookieSecure,
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: maxAgeMs,
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: this.cookieSecure,
      sameSite: 'lax',
      path: '/api/v1/auth',
    });
  }

  /** Issues a fresh CSRF token alongside the refresh token. */
  private issueCsrfCookie(res: Response): void {
    setCsrfCookie(res, this.csrf, this.cookieSecure);
  }

  @RateLimit({ limit: 10, windowSeconds: 3600 })
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @RateLimit({ limit: 15, windowSeconds: 900 })
  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @RateLimit({ limit: 5, windowSeconds: 900 })
  @Post('email/resend')
  @HttpCode(HttpStatus.OK)
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto);
  }

  @RateLimit({ limit: 5, windowSeconds: 900 })
  @Post('password/forgot')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @RateLimit({ limit: 10, windowSeconds: 900 })
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @RateLimit({ limit: 30, windowSeconds: 900 })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, req.headers['user-agent'] || '', req.ip);

    if (result.requiresTwoFactor) {
      return { requiresTwoFactor: true };
    }

    if (result.refreshToken && result.refreshMaxAgeMs) {
      this.setRefreshCookie(res, result.refreshToken, result.refreshMaxAgeMs);
      this.issueCsrfCookie(res);
    }

    return {
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  @UseGuards(RefreshAuthGuard, CsrfGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.refresh(req.user.id, req.refreshTokenId);
    this.setRefreshCookie(res, result.refreshToken, result.refreshMaxAgeMs);
    this.issueCsrfCookie(res);

    return {
      accessToken: result.accessToken,
    };
  }

  @UseGuards(RefreshAuthGuard, CsrfGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.logout(req.refreshTokenId);
    this.clearRefreshCookie(res);
    clearCsrfCookie(res, this.cookieSecure);
    return result;
  }

  /** Sets the session cookies and shapes the body of any sign-in that ends in a session. */
  private finishLogin(
    result: { requiresTwoFactor?: boolean; user?: any; accessToken?: string; refreshToken?: string; refreshMaxAgeMs?: number },
    res: Response,
  ) {
    if (result.requiresTwoFactor) return { requiresTwoFactor: true };
    if (result.refreshToken && result.refreshMaxAgeMs) {
      this.setRefreshCookie(res, result.refreshToken, result.refreshMaxAgeMs);
      this.issueCsrfCookie(res);
    }
    return { user: result.user, accessToken: result.accessToken };
  }

  @RateLimit({ limit: 20, windowSeconds: 900 })
  @Post('qr')
  @HttpCode(HttpStatus.OK)
  async createQr(@Req() req: any) {
    return this.qrLogin.create(req.headers['user-agent'] || '', req.ip);
  }

  @RateLimit({ limit: 300, windowSeconds: 900 })
  @Post('qr/status')
  @HttpCode(HttpStatus.OK)
  async qrStatus(@Body() dto: QrTokenDto) {
    return this.qrLogin.status(dto.token);
  }

  @UseGuards(JwtAuthGuard)
  @Post('qr/preview')
  @HttpCode(HttpStatus.OK)
  async qrPreview(@Body() dto: QrTokenDto) {
    return this.qrLogin.preview(dto.token);
  }

  @UseGuards(JwtAuthGuard)
  @RateLimit({ limit: 30, windowSeconds: 900 })
  @Post('qr/approve')
  @HttpCode(HttpStatus.OK)
  async qrApprove(@CurrentUser('id') userId: string, @Body() dto: QrTokenDto) {
    return this.qrLogin.approve(userId, dto.token);
  }

  @RateLimit({ limit: 30, windowSeconds: 900 })
  @Post('qr/complete')
  @HttpCode(HttpStatus.OK)
  async qrComplete(@Body() dto: QrCompleteDto, @Req() req: any, @Res({ passthrough: true }) res: Response) {
    return this.finishLogin(await this.qrLogin.complete(dto.token, dto.totp, req.headers['user-agent'] || '', req.ip), res);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser('id') userId: string) {
    return this.authService.getMe(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/setup')
  @HttpCode(HttpStatus.OK)
  async twoFactorSetup(@CurrentUser('id') userId: string) {
    return this.twoFactorService.setup(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enable')
  @HttpCode(HttpStatus.OK)
  async twoFactorEnable(
    @CurrentUser('id') userId: string,
    @Body() dto: TwoFactorEnableDto,
  ) {
    return this.twoFactorService.enable(userId, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  async twoFactorDisable(
    @CurrentUser('id') userId: string,
    @Body() dto: TwoFactorVerifyDto,
  ) {
    return this.twoFactorService.disable(userId, dto.code);
  }

  /** Issues a new set of recovery codes; the old ones stop working. */
  @RateLimit({ limit: 5, windowSeconds: 3600, scope: 'user' })
  @UseGuards(JwtAuthGuard)
  @Post('2fa/backup-codes/regenerate')
  @HttpCode(HttpStatus.OK)
  async regenerateBackupCodes(
    @CurrentUser('id') userId: string,
    @Body() dto: TwoFactorVerifyDto,
  ) {
    return this.twoFactorService.regenerateBackupCodes(userId, dto.code);
  }
}
