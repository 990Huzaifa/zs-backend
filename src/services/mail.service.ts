import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrevoClient } from '@getbrevo/brevo';
import * as fs from 'fs';
import * as Handlebars from 'handlebars';
import * as path from 'path';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly client: BrevoClient | null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('MAIL_API_KEY');
    this.client = apiKey ? new BrevoClient({ apiKey }) : null;
  }

  async sendVerifyEmail(to: string, name: string, otp: string): Promise<void> {
    const html = this.renderTemplate('verify-email', {
      name,
      otp,
      appName: this.configService.get('APP_NAME') ?? 'ZS Logistics',
      appUrl: this.configService.get('APP_URL') ?? '',
      logosUrl: this.configService.get('LOGOS_URL') ?? '',
    });

    await this.send(to, 'Verify your email', html);
  }

  async sendResetPasswordEmail(
    to: string,
    name: string,
    otp: string,
  ): Promise<void> {
    const html = this.renderTemplate('reset-password-email', {
      name,
      otp,
      appName: this.configService.get('APP_NAME') ?? 'ZS Logistics',
      appUrl: this.configService.get('APP_URL') ?? '',
      logosUrl: this.configService.get('LOGOS_URL') ?? '',
    });

    await this.send(to, 'Reset your password', html);
  }

  async sendWelcomeEmail(to: string, name: string): Promise<void> {
    const html = this.renderTemplate('welcome-email', {
      name,
      appName: this.configService.get('APP_NAME') ?? 'ZS Logistics',
      appUrl: this.configService.get('APP_URL') ?? '',
      logosUrl: this.configService.get('LOGOS_URL') ?? '',
    });

    await this.send(to, 'Welcome', html);
  }

  private renderTemplate(
    templateName: string,
    context: Record<string, unknown>,
  ): string {
    const templatePath = path.join(
      process.cwd(),
      'src',
      'common',
      'mail',
      'templates',
      `${templateName}.hbs`,
    );
    const distPath = path.join(
      __dirname,
      '..',
      'common',
      'mail',
      'templates',
      `${templateName}.hbs`,
    );

    const filePath = fs.existsSync(templatePath) ? templatePath : distPath;
    if (!fs.existsSync(filePath)) {
      const otp = typeof context.otp === 'string' ? context.otp : '';
      return `<p>${otp}</p>`;
    }

    const source = fs.readFileSync(filePath, 'utf8');
    return Handlebars.compile(source)(context);
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    const from =
      this.configService.get<string>('MAIL_FROM_NOREPLY') ??
      'noreply@example.com';

    if (!this.client) {
      this.logger.debug(`Mail skipped (no MAIL_API_KEY): ${subject} -> ${to}`);
      return;
    }

    try {
      await this.client.transactionalEmails.sendTransacEmail({
        sender: {
          email: from,
          name: this.configService.get('APP_NAME') ?? 'ZS Logistics',
        },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      });
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${String(error)}`);
    }
  }
}
