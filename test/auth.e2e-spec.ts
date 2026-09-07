import { randomUUID } from 'crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getStorageToken } from '@nestjs/throttler';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { Repository } from 'typeorm';

import { MailerService } from '../src/core/mailer/mailer.service';
import { AppModule } from '../src/core/app/app.module';
import { Role } from '../src/modules/rbac/entities/role.entity';
import { UserRole } from '../src/modules/rbac/entities/user-role.entity';
import { RbacCacheService } from '../src/modules/rbac/services/rbac-cache.service';

interface AuthResponseBody {
  accessToken: string;
  user: { id: string; email: string };
}

interface LoginConfirmationPendingBody {
  attemptId: string;
  confirmationMethod: string;
  expiresAt: string;
  resendAvailableAt: string;
}

interface SentOtpEmail {
  to: string;
  code: string;
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let roleRepository: Repository<Role>;
  let userRoleRepository: Repository<UserRole>;
  let rbacCacheService: RbacCacheService;

  const sentOtpEmails: SentOtpEmail[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getStorageToken())
      .useValue({
        increment: () =>
          Promise.resolve({
            totalHits: 0,
            timeToExpire: 0,
            isBlocked: false,
            timeToBlockExpire: 0,
          }),
      })
      .overrideProvider(MailerService)
      .useValue({
        sendMail: jest.fn(),
        sendLoginOtpEmail: jest.fn(
          ({ to, code }: { to: string; code: string }) => {
            sentOtpEmails.push({ to, code });
            return Promise.resolve();
          },
        ),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    roleRepository = moduleFixture.get(getRepositoryToken(Role));
    userRoleRepository = moduleFixture.get(getRepositoryToken(UserRole));
    rbacCacheService = moduleFixture.get(RbacCacheService);
  });

  afterAll(async () => {
    await app.close();
  });

  const uniqueEmail = () => `e2e-${randomUUID()}@example.com`;
  const password = 'p@ssw0rd123';

  const registerUser = async (email: string): Promise<AuthResponseBody> => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);

    return response.body as AuthResponseBody;
  };

  const latestOtpFor = (email: string): string => {
    const email_ = sentOtpEmails.filter((sent) => sent.to === email).pop();

    if (!email_) {
      throw new Error(`No OTP email captured for ${email}`);
    }

    return email_.code;
  };

  describe('POST /auth/register', () => {
    it('registers a new user and returns an access token', async () => {
      const email = uniqueEmail();

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      const body = response.body as AuthResponseBody;

      expect(typeof body.accessToken).toBe('string');
      expect(typeof body.user.id).toBe('string');
      expect(body.user.email).toBe(email);
      expect(JSON.stringify(body)).not.toContain('passwordHash');
    });

    it('rejects a duplicate email with 409', async () => {
      const email = uniqueEmail();

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(409);
    });

    it('rejects an invalid email with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'not-an-email', password })
        .expect(400);
    });

    it('rejects a too-short password with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: uniqueEmail(), password: 'short' })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    it('logs in with correct credentials', async () => {
      const email = uniqueEmail();

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);

      const body = response.body as AuthResponseBody;

      expect(typeof body.accessToken).toBe('string');
      expect(typeof body.user.id).toBe('string');
      expect(body.user.email).toBe(email);
    });

    it('rejects an incorrect password with 401', async () => {
      const email = uniqueEmail();

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'wrong-password' })
        .expect(401);
    });

    it('rejects an unknown email with 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: uniqueEmail(), password })
        .expect(401);
    });
  });

  describe('login with email confirmation enabled', () => {
    let adminAccessToken: string;

    const setConfirmationEnabled = (enabled: boolean) =>
      request(app.getHttpServer())
        .put('/admin/settings/action-confirmations/auth.login')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ enabled, confirmationMethod: 'otp' })
        .expect(200);

    beforeAll(async () => {
      // Bootstrap the first admin per src/modules/rbac/README.MD: assign the
      // seed-migration `admin` role directly (no self-serve bootstrap endpoint),
      // then reload the cache to mimic the documented restart.
      const admin = await registerUser(
        `e2e-otp-admin-${randomUUID()}@example.com`,
      );
      adminAccessToken = admin.accessToken;

      const adminRole = await roleRepository.findOneByOrFail({
        name: 'admin',
      });
      await userRoleRepository.save(
        userRoleRepository.create({
          userId: admin.user.id,
          roleId: adminRole.id,
        }),
      );
      await rbacCacheService.reload();

      await setConfirmationEnabled(true);
    });

    afterAll(async () => {
      await setConfirmationEnabled(false);
    });

    it('returns 202 with a pending attempt instead of a token', async () => {
      const email = uniqueEmail();
      await registerUser(email);

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(202);

      const body = response.body as LoginConfirmationPendingBody;

      expect(body.attemptId).toBeDefined();
      expect(body.confirmationMethod).toBe('otp');
      expect(body.expiresAt).toBeDefined();
      expect(body.resendAvailableAt).toBeDefined();
      expect(JSON.stringify(body)).not.toContain('accessToken');
    });

    it('completes the login via POST /auth/login/confirm with the emailed OTP', async () => {
      const email = uniqueEmail();
      await registerUser(email);

      const pending = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(202);
      const { attemptId } = pending.body as LoginConfirmationPendingBody;
      const otpCode = latestOtpFor(email);

      const confirmed = await request(app.getHttpServer())
        .post('/auth/login/confirm')
        .send({ attemptId, otpCode })
        .expect(200);

      const body = confirmed.body as AuthResponseBody;

      expect(typeof body.accessToken).toBe('string');
      expect(body.user.email).toBe(email);
    });

    it('rejects an incorrect OTP code with 401', async () => {
      const email = uniqueEmail();
      await registerUser(email);

      const pending = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(202);
      const { attemptId } = pending.body as LoginConfirmationPendingBody;

      await request(app.getHttpServer())
        .post('/auth/login/confirm')
        .send({ attemptId, otpCode: '000000' })
        .expect(401);
    });

    it('locks the attempt after exceeding the max OTP attempts', async () => {
      const email = uniqueEmail();
      await registerUser(email);

      const pending = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(202);
      const { attemptId } = pending.body as LoginConfirmationPendingBody;
      const correctCode = latestOtpFor(email);
      const wrongCode = correctCode === '000000' ? '111111' : '000000';

      // LOGIN_OTP_MAX_ATTEMPTS defaults to 5 — exhaust them with wrong codes.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await request(app.getHttpServer())
          .post('/auth/login/confirm')
          .send({ attemptId, otpCode: wrongCode })
          .expect(401);
      }

      await request(app.getHttpServer())
        .post('/auth/login/confirm')
        .send({ attemptId, otpCode: correctCode })
        .expect(401);
    });

    it('rejects a resend within the cooldown window with 429', async () => {
      const email = uniqueEmail();
      await registerUser(email);

      const pending = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(202);
      const { attemptId } = pending.body as LoginConfirmationPendingBody;

      await request(app.getHttpServer())
        .post('/auth/login/resend')
        .send({ attemptId })
        .expect(429);
    });
  });
});
