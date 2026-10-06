import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

type CodeMailKind = 'verification' | 'passwordReset' | 'login';

const CODE_MAIL: Record<CodeMailKind, { subject: string; lead: string; leadRu: string }> = {
  verification: {
    subject: 'Confirm your e-mail / Подтвердите e-mail',
    lead: 'Your e-mail confirmation code',
    leadRu: 'Ваш код подтверждения e-mail',
  },
  passwordReset: {
    subject: 'Password reset code / Код для сброса пароля',
    lead: 'Your password reset code',
    leadRu: 'Ваш код для сброса пароля',
  },
  login: {
    subject: 'Your sign-in code / Ваш код для входа',
    lead: 'Your sign-in code',
    leadRu: 'Ваш код для входа',
  },
};

/**
 * Sends transactional e-mail.
 *
 * With `SMTP_HOST` set the messages go through that SMTP server (any provider,
 * or the bundled Mailpit container for local development). Without it the
 * service runs as a local adapter: the message is written to the server log,
 * so a fresh checkout works with no mail provider, but the log then contains
 * the codes. That is why the adapter refuses to print them in production.
 */
@Injectable()
export class MailerService implements OnModuleInit {
  private readonly logger = new Logger(MailerService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const host = this.config.get<string>('SMTP_HOST');
    if (!host) {
      this.logger.warn(
        'SMTP_HOST is not set: e-mail is not sent, codes are only logged outside production.',
      );
      return;
    }

    const port = Number(this.config.get<string>('SMTP_PORT') ?? 587) || 587;
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASSWORD');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      // Implicit TLS on 465; STARTTLS is negotiated automatically otherwise.
      secure: this.config.get<string>('SMTP_SECURE') === 'true' || port === 465,
      auth: user ? { user, pass } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });

    this.logger.log(`SMTP transport configured for ${host}:${port}`);
  }

  get isConfigured(): boolean {
    return this.transporter !== null;
  }

  async sendVerificationEmail(email: string, code: string): Promise<void> {
    await this.sendCode('verification', email, code);
  }

  async sendPasswordResetEmail(email: string, code: string): Promise<void> {
    await this.sendCode('passwordReset', email, code);
  }

  async sendLoginCodeEmail(email: string, code: string): Promise<void> {
    await this.sendCode('login', email, code);
  }

  private async sendCode(kind: CodeMailKind, to: string, code: string): Promise<void> {
    const appName = this.config.get<string>('APP_NAME', 'FLUX');
    const copy = CODE_MAIL[kind];

    await this.send({
      to,
      subject: `${appName}: ${copy.subject}`,
      text:
        `${copy.lead}: ${code}\n${copy.leadRu}: ${code}\n\n` +
        `The code is valid for 10 minutes. If you did not request it, ignore this message.\n` +
        `Код действителен 10 минут. Если вы его не запрашивали, проигнорируйте письмо.`,
      html:
        `<p>${copy.lead}:</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${code}</p>` +
        `<p>${copy.leadRu}.</p>` +
        `<p style="color:#667085">The code is valid for 10 minutes. If you did not request it, ignore this message.<br>` +
        `Код действителен 10 минут. Если вы его не запрашивали, проигнорируйте письмо.</p>`,
    });
  }

  /**
   * Queues a message for delivery and returns immediately.
   *
   * Not awaiting the SMTP round trip keeps response times independent of
   * whether an address has an account (a slow "exists" branch would let a
   * caller enumerate accounts by timing), and a slow mail server never stalls
   * the API. A delivery failure is logged and swallowed for the same reason:
   * the client is always told "sent".
   */
  async send(message: MailMessage): Promise<void> {
    void this.deliver(message);
  }

  private async deliver(message: MailMessage): Promise<void> {
    const from = this.config.get<string>('SMTP_FROM') ?? 'FLUX <no-reply@localhost>';

    if (!this.transporter) {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        this.logger.error(`SMTP is not configured; could not deliver "${message.subject}" to ${message.to}`);
        return;
      }
      this.logger.log(`[LOCAL MAIL ADAPTER] To: ${message.to}; Subject: ${message.subject}\n${message.text}`);
      return;
    }

    try {
      await this.transporter.sendMail({ from, ...message });
    } catch (err) {
      this.logger.error(`Failed to send "${message.subject}" to ${message.to}: ${err}`);
    }
  }
}
