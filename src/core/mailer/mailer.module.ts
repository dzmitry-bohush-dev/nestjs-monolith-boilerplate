import { Module } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

import { ConfigModule } from '@/core/config/config.module';
import { ConfigService } from '@/core/config/config.service';
import { MAIL_TRANSPORT } from '@/core/mailer/mailer.constants';
import { MailerService } from '@/core/mailer/mailer.service';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: MAIL_TRANSPORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): nodemailer.Transporter => {
        const host = config.get('MAIL_HOST');

        if (!host) {
          return nodemailer.createTransport({ jsonTransport: true });
        }

        const user = config.get('MAIL_USER');
        const password = config.get('MAIL_PASSWORD');

        return nodemailer.createTransport({
          host,
          port: Number(config.get('MAIL_PORT')),
          secure: String(config.get('MAIL_SECURE')) === 'true',
          auth: user ? { user, pass: password } : undefined,
        });
      },
    },
    MailerService,
  ],
  exports: [MailerService],
})
export class MailerModule {}
