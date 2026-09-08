import { randomUUID } from 'crypto';

import { JwtService } from '@nestjs/jwt';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { getStorageToken } from '@nestjs/throttler';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';

import { ConfigService } from '../src/core/config/config.service';
import { MailerService } from '../src/core/mailer/mailer.service';
import { AppModule } from '../src/core/app/app.module';
import { Role } from '../src/modules/rbac/entities/role.entity';
import { UserRole } from '../src/modules/rbac/entities/user-role.entity';
import { RbacCacheService } from '../src/modules/rbac/services/rbac-cache.service';
import { initFastifyTestApp } from './support/app';
import { cookieHeaderFrom, cookieValue, findSetCookie } from './support/auth';

interface AuthResponseBody {
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
  let app: NestFastifyApplication;
  let roleRepository: Repository<Role>;
  let userRoleRepository: Repository<UserRole>;
  let rbacCacheService: RbacCacheService;
  let jwtService: JwtService;
  let configService: ConfigService;

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

    app = await initFastifyTestApp(moduleFixture);

    roleRepository = moduleFixture.get(getRepositoryToken(Role));
    userRoleRepository = moduleFixture.get(getRepositoryToken(UserRole));
    rbacCacheService = moduleFixture.get(RbacCacheService);
    jwtService = moduleFixture.get(JwtService);
    configService = moduleFixture.get(ConfigService);
  });

  afterAll(async () => {
    await app.close();
  });

  const uniqueEmail = () => `e2e-${randomUUID()}@example.com`;
  const password = 'p@ssw0rd123';

  const registerUser = (email: string) =>
    request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);

  const latestOtpFor = (email: string): string => {
    const email_ = sentOtpEmails.filter((sent) => sent.to === email).pop();

    if (!email_) {
      throw new Error(`No OTP email captured for ${email}`);
    }

    return email_.code;
  };

  describe('POST /auth/register', () => {
    it('registers a new user and sets access/refresh cookies', async () => {
      const email = uniqueEmail();

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      const body = response.body as AuthResponseBody;

      expect(typeof body.user.id).toBe('string');
      expect(body.user.email).toBe(email);
      expect(JSON.stringify(body)).not.toContain('passwordHash');
      expect(JSON.stringify(body)).not.toContain('accessToken');

      expect(cookieValue(response, 'access_token')).toBeTruthy();
      expect(cookieValue(response, 'refresh_token')).toBeTruthy();

      const setCookie = response.headers['set-cookie'] as unknown as string[];
      const access = setCookie.find((c) => c.startsWith('access_token='));
      const refresh = setCookie.find((c) => c.startsWith('refresh_token='));

      expect(access).toContain('HttpOnly');
      expect(access).toContain('Path=/');
      expect(refresh).toContain('HttpOnly');
      expect(refresh).toContain('Path=/auth');
    });

    it('rejects a duplicate email with 409', async () => {
      const email = uniqueEmail();

      await registerUser(email);

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
    it('logs in with correct credentials and sets fresh cookies', async () => {
      const email = uniqueEmail();

      await registerUser(email);

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);

      const body = response.body as AuthResponseBody;

      expect(typeof body.user.id).toBe('string');
      expect(body.user.email).toBe(email);
      expect(cookieValue(response, 'access_token')).toBeTruthy();
      expect(cookieValue(response, 'refresh_token')).toBeTruthy();
    });

    it('rejects an incorrect password with 401', async () => {
      const email = uniqueEmail();

      await registerUser(email);

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
    let adminCookie: string;

    const setConfirmationEnabled = (enabled: boolean) =>
      request(app.getHttpServer())
        .put('/admin/settings/action-confirmations/auth.login')
        .set('Cookie', adminCookie)
        .send({ enabled, confirmationMethod: 'otp' })
        .expect(200);

    beforeAll(async () => {
      // Bootstrap the first admin per src/modules/rbac/README.MD: assign the
      // seed-migration `admin` role directly (no self-serve bootstrap endpoint),
      // then reload the cache to mimic the documented restart.
      const admin = await registerUser(
        `e2e-otp-admin-${randomUUID()}@example.com`,
      );
      adminCookie = cookieHeaderFrom(admin);
      const adminBody = admin.body as AuthResponseBody;

      const adminRole = await roleRepository.findOneByOrFail({
        name: 'admin',
      });
      await userRoleRepository.save(
        userRoleRepository.create({
          userId: adminBody.user.id,
          roleId: adminRole.id,
        }),
      );
      await rbacCacheService.reload();

      await setConfirmationEnabled(true);
    });

    afterAll(async () => {
      await setConfirmationEnabled(false);
    });

    it('returns 202 with a pending attempt instead of tokens', async () => {
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
      expect(response.headers['set-cookie']).toBeUndefined();
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

      expect(body.user.email).toBe(email);
      expect(cookieValue(confirmed, 'access_token')).toBeTruthy();
      expect(cookieValue(confirmed, 'refresh_token')).toBeTruthy();
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

  describe('POST /auth/refresh', () => {
    it('rotates the access/refresh cookies to genuinely new values', async () => {
      const registered = await registerUser(uniqueEmail());

      const oldAccess = cookieValue(registered, 'access_token');
      const oldRefresh = cookieValue(registered, 'refresh_token');

      const refreshed = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', cookieHeaderFrom(registered))
        .expect(200);

      const newAccess = cookieValue(refreshed, 'access_token');
      const newRefresh = cookieValue(refreshed, 'refresh_token');

      expect(newAccess).toBeTruthy();
      expect(newRefresh).toBeTruthy();
      expect(newAccess).not.toBe(oldAccess);
      expect(newRefresh).not.toBe(oldRefresh);

      const registeredBody = registered.body as AuthResponseBody;
      const refreshedBody = refreshed.body as AuthResponseBody;
      expect(refreshedBody.user.id).toBe(registeredBody.user.id);
      expect(JSON.stringify(refreshedBody)).not.toContain('accessToken');
    });

    it('rejects a missing refresh cookie with 401', async () => {
      await request(app.getHttpServer()).post('/auth/refresh').expect(401);
    });

    it('rejects an expired refresh cookie with 401', async () => {
      const registered = await registerUser(uniqueEmail());
      const { user } = registered.body as AuthResponseBody;

      const expiredRefreshToken = jwtService.sign(
        { sub: user.id, type: 'refresh' },
        {
          secret: configService.get('JWT_REFRESH_SECRET'),
          expiresIn: '-1s',
        },
      );

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', `refresh_token=${expiredRefreshToken}`)
        .expect(401);
    });

    it('rejects a refresh cookie with an invalid signature with 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', 'refresh_token=not-a-valid-jwt')
        .expect(401);
    });

    it('rejects an access token used as a refresh cookie with 401', async () => {
      const registered = await registerUser(uniqueEmail());
      const accessToken = cookieValue(registered, 'access_token');

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', `refresh_token=${accessToken}`)
        .expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('clears both cookies and returns 204 even with no prior auth', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .expect(204);

      expect(findSetCookie(response, 'access_token')).toBeDefined();
      expect(findSetCookie(response, 'refresh_token')).toBeDefined();
    });

    it('clears cookies so a subsequent protected request 401s', async () => {
      const registered = await registerUser(uniqueEmail());

      const loggedOut = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', cookieHeaderFrom(registered))
        .expect(204);

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', cookieHeaderFrom(loggedOut))
        .expect(401);
    });
  });
});
