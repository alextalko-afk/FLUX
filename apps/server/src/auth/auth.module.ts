import { Module, Global } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { VerificationService } from './verification.service';
import { TwoFactorService } from './two-factor.service';
import { MailerService } from './mailer.service';
import { QrLoginService } from './qr-login.service';
import { CsrfGuard } from '../security/csrf.guard';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    VerificationService,
    TwoFactorService,
    MailerService,
    QrLoginService,
    CsrfGuard,
  ],
  exports: [
    AuthService,
    PasswordService,
    TokenService,
    VerificationService,
    TwoFactorService,
    MailerService,
  ],
})
export class AuthModule {}
