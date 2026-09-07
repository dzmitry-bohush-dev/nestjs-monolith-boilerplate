import { Test, TestingModule } from '@nestjs/testing';

import { ConfigService } from '@/core/config/config.service';
import { MAIL_TRANSPORT } from '@/core/mailer/mailer.constants';
import { MailerService } from '@/core/mailer/mailer.service';

describe('MailerService', () => {
  let service: MailerService;
  let transport: { sendMail: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailerService,
        {
          provide: MAIL_TRANSPORT,
          useValue: { sendMail: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<MailerService>(MailerService);
    transport = module.get(MAIL_TRANSPORT);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendMail', () => {
    it('sends via the injected transport using the configured from address', async () => {
      configService.get.mockReturnValue('no-reply@example.com');
      transport.sendMail.mockResolvedValue({ messageId: '1' });

      const result = await service.sendMail({
        to: 'user@example.com',
        subject: 'Subject',
        text: 'text body',
        html: '<p>html body</p>',
      });

      expect(configService.get).toHaveBeenCalledWith('MAIL_FROM');
      expect(transport.sendMail).toHaveBeenCalledWith({
        from: 'no-reply@example.com',
        to: 'user@example.com',
        subject: 'Subject',
        text: 'text body',
        html: '<p>html body</p>',
      });
      expect(result).toEqual({ messageId: '1' });
    });
  });

  describe('sendLoginOtpEmail', () => {
    it('renders the OTP template and sends it through sendMail', async () => {
      configService.get.mockReturnValue('no-reply@example.com');
      transport.sendMail.mockResolvedValue({ messageId: '2' });

      await service.sendLoginOtpEmail({
        to: 'user@example.com',
        code: '123456',
        ttlMinutes: 10,
      });

      expect(transport.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'no-reply@example.com',
          to: 'user@example.com',
          subject: 'Your login confirmation code',
          text: expect.stringContaining('123456') as string,
          html: expect.stringContaining('123456') as string,
        }),
      );
    });
  });
});
