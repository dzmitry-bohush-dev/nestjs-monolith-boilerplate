import { Inject, Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

import { ConfigService } from '@/core/config/config.service';
import { MAIL_TRANSPORT } from '@/core/mailer/mailer.constants';
import { renderAccountDeletionOtpEmail } from '@/core/mailer/templates/account-deletion-otp.template';
import { renderEmailChangeOtpEmail } from '@/core/mailer/templates/email-change-otp.template';
import { renderLoginOtpEmail } from '@/core/mailer/templates/login-otp.template';

export interface SendMailParams {
  to: string;
  subject: string;
  text: string;
  html: string;
}

@Injectable()
export class MailerService {
  constructor(
    @Inject(MAIL_TRANSPORT)
    private readonly transport: nodemailer.Transporter,
    private readonly config: ConfigService,
  ) {}

  sendMail(params: SendMailParams): Promise<unknown> {
    const { to, subject, text, html } = params;

    return this.transport.sendMail({
      from: this.config.get('MAIL_FROM'),
      to,
      subject,
      text,
      html,
    });
  }

  sendLoginOtpEmail(params: {
    to: string;
    code: string;
    ttlMinutes: number;
  }): Promise<unknown> {
    const { to, code, ttlMinutes } = params;
    const { subject, text, html } = renderLoginOtpEmail(code, ttlMinutes);

    return this.sendMail({ to, subject, text, html });
  }

  sendEmailChangeOtpEmail(params: {
    to: string;
    code: string;
    ttlMinutes: number;
    newEmail: string;
  }): Promise<unknown> {
    const { to, code, ttlMinutes, newEmail } = params;
    const { subject, text, html } = renderEmailChangeOtpEmail(
      code,
      ttlMinutes,
      newEmail,
    );

    return this.sendMail({ to, subject, text, html });
  }

  sendAccountDeletionOtpEmail(params: {
    to: string;
    code: string;
    ttlMinutes: number;
  }): Promise<unknown> {
    const { to, code, ttlMinutes } = params;
    const { subject, text, html } = renderAccountDeletionOtpEmail(
      code,
      ttlMinutes,
    );

    return this.sendMail({ to, subject, text, html });
  }
}
