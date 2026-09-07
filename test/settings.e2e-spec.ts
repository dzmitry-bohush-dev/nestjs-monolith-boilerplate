import { randomUUID } from 'crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getStorageToken } from '@nestjs/throttler';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { Repository } from 'typeorm';

import { AppModule } from '../src/core/app/app.module';
import { Role } from '../src/modules/rbac/entities/role.entity';
import { UserRole } from '../src/modules/rbac/entities/user-role.entity';
import { RbacCacheService } from '../src/modules/rbac/services/rbac-cache.service';

interface AuthResponseBody {
  accessToken: string;
  user: { id: string; email: string };
}

interface ActionConfirmationSettingBody {
  action: string;
  enabled: boolean;
  confirmationMethod: string;
}

describe('Settings (e2e)', () => {
  let app: INestApplication<App>;
  let roleRepository: Repository<Role>;
  let userRoleRepository: Repository<UserRole>;
  let rbacCacheService: RbacCacheService;

  let adminAccessToken: string;

  const password = 'p@ssw0rd123';
  const uniqueEmail = (label: string) =>
    `e2e-settings-${label}-${randomUUID()}@example.com`;

  const registerUser = async (email: string): Promise<AuthResponseBody> => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);

    return response.body as AuthResponseBody;
  };

  const authed = (method: 'get' | 'put', url: string) =>
    request(app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${adminAccessToken}`);

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
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    roleRepository = moduleFixture.get(getRepositoryToken(Role));
    userRoleRepository = moduleFixture.get(getRepositoryToken(UserRole));
    rbacCacheService = moduleFixture.get(RbacCacheService);

    // Bootstrap the first admin per src/modules/rbac/README.MD: assign the
    // seed-migration `admin` role directly (no self-serve bootstrap endpoint),
    // then reload the cache to mimic the documented restart.
    const admin = await registerUser(uniqueEmail('admin'));
    adminAccessToken = admin.accessToken;

    const adminRole = await roleRepository.findOneByOrFail({ name: 'admin' });
    await userRoleRepository.save(
      userRoleRepository.create({
        userId: admin.user.id,
        roleId: adminRole.id,
      }),
    );
    await rbacCacheService.reload();
  });

  afterAll(async () => {
    // Restore the seeded default so other e2e suites see confirmation disabled.
    await authed('put', '/admin/settings/action-confirmations/auth.login').send(
      { enabled: false, confirmationMethod: 'otp' },
    );

    await app.close();
  });

  describe('authentication and authorization', () => {
    it('rejects requests with no bearer token with 401', async () => {
      await request(app.getHttpServer())
        .get('/admin/settings/action-confirmations')
        .expect(401);
    });

    it('rejects a non-admin user with 403', async () => {
      const plainUser = await registerUser(uniqueEmail('plain'));

      await request(app.getHttpServer())
        .get('/admin/settings/action-confirmations')
        .set('Authorization', `Bearer ${plainUser.accessToken}`)
        .expect(403);
    });
  });

  describe('GET /admin/settings/action-confirmations', () => {
    it('lists the seeded auth.login setting', async () => {
      const response = await authed(
        'get',
        '/admin/settings/action-confirmations',
      ).expect(200);

      const settings = response.body as ActionConfirmationSettingBody[];
      expect(settings.some((setting) => setting.action === 'auth.login')).toBe(
        true,
      );
    });
  });

  describe('GET /admin/settings/action-confirmations/:action', () => {
    it('returns the setting for a known action', async () => {
      const response = await authed(
        'get',
        '/admin/settings/action-confirmations/auth.login',
      ).expect(200);

      const setting = response.body as ActionConfirmationSettingBody;
      expect(setting.action).toBe('auth.login');
    });

    it('returns 400 for an unsupported action', async () => {
      await authed(
        'get',
        '/admin/settings/action-confirmations/unsupported.action',
      ).expect(400);
    });
  });

  describe('PUT /admin/settings/action-confirmations/:action', () => {
    it('toggles the setting on and back off', async () => {
      const enabled = await authed(
        'put',
        '/admin/settings/action-confirmations/auth.login',
      )
        .send({ enabled: true, confirmationMethod: 'otp' })
        .expect(200);
      expect((enabled.body as ActionConfirmationSettingBody).enabled).toBe(
        true,
      );

      const disabled = await authed(
        'put',
        '/admin/settings/action-confirmations/auth.login',
      )
        .send({ enabled: false, confirmationMethod: 'otp' })
        .expect(200);
      expect((disabled.body as ActionConfirmationSettingBody).enabled).toBe(
        false,
      );
    });

    it('rejects an unsupported action with 400', async () => {
      await authed(
        'put',
        '/admin/settings/action-confirmations/unsupported.action',
      )
        .send({ enabled: true })
        .expect(400);
    });
  });
});
