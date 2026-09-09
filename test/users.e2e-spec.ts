import { randomUUID } from 'crypto';

import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { getStorageToken } from '@nestjs/throttler';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';

import { AppModule } from '../src/core/app/app.module';
import { MailerService } from '../src/core/mailer/mailer.service';
import { Role } from '../src/modules/rbac/entities/role.entity';
import { UserRole } from '../src/modules/rbac/entities/user-role.entity';
import { RbacCacheService } from '../src/modules/rbac/services/rbac-cache.service';
import { initFastifyTestApp } from './support/app';
import { cookieHeaderFrom } from './support/auth';

interface AuthResponseBody {
  user: { id: string; email: string };
}

interface AccountDeletionPendingBody {
  challengeId: string;
  requiresConfirmation: true;
  confirmationMethod: string;
  expiresAt: string;
  resendAvailableAt: string;
}

interface SentDeletionOtpEmail {
  to: string;
  code: string;
}

describe('Users (e2e)', () => {
  let app: NestFastifyApplication;
  let roleRepository: Repository<Role>;
  let userRoleRepository: Repository<UserRole>;
  let rbacCacheService: RbacCacheService;

  const password = 'p@ssw0rd123';
  const sentDeletionOtpEmails: SentDeletionOtpEmail[] = [];

  const uniqueEmail = (label: string) =>
    `e2e-users-${label}-${randomUUID()}@example.com`;

  const registerUser = (email: string) =>
    request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);

  // The seed migration grants the `admin` role every action (actions: NULL)
  // on `users` — reuse it as the permission-holder for both the read and
  // delete flows, mirroring how rbac.e2e-spec.ts bootstraps admin.
  const grantAdminPermission = async (userId: string) => {
    const adminRole = await roleRepository.findOneByOrFail({ name: 'admin' });
    await userRoleRepository.save(
      userRoleRepository.create({ userId, roleId: adminRole.id }),
    );
    await rbacCacheService.reload();
  };

  const latestDeletionOtpFor = (email: string): string => {
    const sent = sentDeletionOtpEmails.filter((s) => s.to === email).pop();

    if (!sent) {
      throw new Error(`No deletion OTP email captured for ${email}`);
    }

    return sent.code;
  };

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
        sendAccountDeletionOtpEmail: jest.fn(
          ({ to, code }: { to: string; code: string }) => {
            sentDeletionOtpEmails.push({ to, code });
            return Promise.resolve();
          },
        ),
      })
      .compile();

    app = await initFastifyTestApp(moduleFixture);

    roleRepository = moduleFixture.get(getRepositoryToken(Role));
    userRoleRepository = moduleFixture.get(getRepositoryToken(UserRole));
    rbacCacheService = moduleFixture.get(RbacCacheService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects requests with no access cookie with 401', async () => {
    await request(app.getHttpServer())
      .get(`/users/${randomUUID()}`)
      .expect(401);
  });

  it('allows a user to fetch their own profile', async () => {
    const registered = await registerUser(uniqueEmail('self-profile'));
    const cookie = cookieHeaderFrom(registered);
    const { user } = registered.body as AuthResponseBody;

    const response = await request(app.getHttpServer())
      .get(`/users/${user.id}`)
      .set('Cookie', cookie)
      .expect(200);

    expect(response.body).toEqual({
      id: user.id,
      email: user.email,
      photo: null,
      firstName: null,
      lastName: null,
    });
  });

  it('rejects a user without users:read permission requesting another profile with 403', async () => {
    const viewer = await registerUser(uniqueEmail('viewer'));
    const viewerCookie = cookieHeaderFrom(viewer);
    const target = await registerUser(uniqueEmail('target'));
    const { user: targetUser } = target.body as AuthResponseBody;

    await request(app.getHttpServer())
      .get(`/users/${targetUser.id}`)
      .set('Cookie', viewerCookie)
      .expect(403);
  });

  it('allows a user with users:read permission to fetch another profile', async () => {
    const permittedRes = await registerUser(uniqueEmail('permitted'));
    const permittedCookie = cookieHeaderFrom(permittedRes);
    const { user: permittedUser } = permittedRes.body as AuthResponseBody;
    await grantAdminPermission(permittedUser.id);

    const target = await registerUser(uniqueEmail('target-viewed'));
    const { user: targetUser } = target.body as AuthResponseBody;

    const response = await request(app.getHttpServer())
      .get(`/users/${targetUser.id}`)
      .set('Cookie', permittedCookie)
      .expect(200);

    expect(response.body).toEqual({
      id: targetUser.id,
      email: targetUser.email,
      photo: null,
      firstName: null,
      lastName: null,
    });
  });

  it('returns 404 for a non-existent userId', async () => {
    const viewer = await registerUser(uniqueEmail('not-found-viewer'));
    const viewerCookie = cookieHeaderFrom(viewer);

    await request(app.getHttpServer())
      .get(`/users/${randomUUID()}`)
      .set('Cookie', viewerCookie)
      .expect(404);
  });

  describe('account deletion', () => {
    it('completes the self happy path: initiate -> confirm -> old cookies rejected with 401', async () => {
      const registered = await registerUser(uniqueEmail('self-deletion'));
      const cookie = cookieHeaderFrom(registered);
      const { user } = registered.body as AuthResponseBody;

      const initiateResponse = await request(app.getHttpServer())
        .post(`/users/${user.id}/deletion`)
        .set('Cookie', cookie)
        .send({ reason: 'no longer needed' })
        .expect(202);

      const pending = initiateResponse.body as AccountDeletionPendingBody;
      expect(pending.requiresConfirmation).toBe(true);
      expect(pending.confirmationMethod).toBe('otp');

      const code = latestDeletionOtpFor(user.email);

      const confirmResponse = await request(app.getHttpServer())
        .post(`/users/${user.id}/deletion/confirm`)
        .set('Cookie', cookie)
        .send({ challengeId: pending.challengeId, code })
        .expect(200);

      expect(confirmResponse.body).toMatchObject({ id: user.id });
      expect((confirmResponse.body as { email: string }).email).not.toBe(
        user.email,
      );

      await request(app.getHttpServer())
        .get(`/users/${user.id}`)
        .set('Cookie', cookie)
        .expect(401);
    });

    it('completes the admin immediate path with no OTP step and revokes the target login', async () => {
      const adminRes = await registerUser(uniqueEmail('deletion-admin'));
      const adminCookie = cookieHeaderFrom(adminRes);
      const { user: adminUser } = adminRes.body as AuthResponseBody;
      await grantAdminPermission(adminUser.id);

      const targetRes = await registerUser(uniqueEmail('deletion-target'));
      const targetCookie = cookieHeaderFrom(targetRes);
      const { user: targetUser } = targetRes.body as AuthResponseBody;

      const response = await request(app.getHttpServer())
        .post(`/users/${targetUser.id}/deletion`)
        .set('Cookie', adminCookie)
        .send({})
        .expect(200);

      expect(response.body).toMatchObject({ id: targetUser.id });
      expect((response.body as { email: string }).email).not.toBe(
        targetUser.email,
      );

      await request(app.getHttpServer())
        .get(`/users/${targetUser.id}`)
        .set('Cookie', targetCookie)
        .expect(401);
    });

    it('rejects a user with neither self nor delete permission with 403', async () => {
      const viewer = await registerUser(uniqueEmail('del-viewer'));
      const viewerCookie = cookieHeaderFrom(viewer);

      const target = await registerUser(uniqueEmail('del-403-target'));
      const { user: targetUser } = target.body as AuthResponseBody;

      await request(app.getHttpServer())
        .post(`/users/${targetUser.id}/deletion`)
        .set('Cookie', viewerCookie)
        .send({})
        .expect(403);
    });

    it('returns 409 on a genuine concurrent double-initiate for the same user', async () => {
      const registered = await registerUser(uniqueEmail('del-concurrent'));
      const cookie = cookieHeaderFrom(registered);
      const { user } = registered.body as AuthResponseBody;

      const [first, second] = await Promise.all([
        request(app.getHttpServer())
          .post(`/users/${user.id}/deletion`)
          .set('Cookie', cookie)
          .send({}),
        request(app.getHttpServer())
          .post(`/users/${user.id}/deletion`)
          .set('Cookie', cookie)
          .send({}),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([202, 409]);
    });

    it('rejects an incorrect OTP code at confirm with 401', async () => {
      const registered = await registerUser(uniqueEmail('del-wrong-otp'));
      const cookie = cookieHeaderFrom(registered);
      const { user } = registered.body as AuthResponseBody;

      const initiateResponse = await request(app.getHttpServer())
        .post(`/users/${user.id}/deletion`)
        .set('Cookie', cookie)
        .send({})
        .expect(202);

      const pending = initiateResponse.body as AccountDeletionPendingBody;

      await request(app.getHttpServer())
        .post(`/users/${user.id}/deletion/confirm`)
        .set('Cookie', cookie)
        .send({ challengeId: pending.challengeId, code: '000000' })
        .expect(401);

      // The account must remain usable after a wrong-code attempt.
      await request(app.getHttpServer())
        .get(`/users/${user.id}`)
        .set('Cookie', cookie)
        .expect(200);
    });
  });
});
