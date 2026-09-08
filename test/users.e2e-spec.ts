import { randomUUID } from 'crypto';

import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { getStorageToken } from '@nestjs/throttler';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';

import { AppModule } from '../src/core/app/app.module';
import { Role } from '../src/modules/rbac/entities/role.entity';
import { UserRole } from '../src/modules/rbac/entities/user-role.entity';
import { RbacCacheService } from '../src/modules/rbac/services/rbac-cache.service';
import { initFastifyTestApp } from './support/app';
import { cookieHeaderFrom } from './support/auth';

interface AuthResponseBody {
  user: { id: string; email: string };
}

describe('Users (e2e)', () => {
  let app: NestFastifyApplication;
  let roleRepository: Repository<Role>;
  let userRoleRepository: Repository<UserRole>;
  let rbacCacheService: RbacCacheService;

  const password = 'p@ssw0rd123';
  const uniqueEmail = (label: string) =>
    `e2e-users-${label}-${randomUUID()}@example.com`;

  const registerUser = (email: string) =>
    request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);

  // The seed migration grants the `admin` role `users:read` — reuse it as
  // the permission-holder, mirroring how rbac.e2e-spec.ts bootstraps admin.
  const grantUsersReadPermission = async (userId: string) => {
    const adminRole = await roleRepository.findOneByOrFail({ name: 'admin' });
    await userRoleRepository.save(
      userRoleRepository.create({ userId, roleId: adminRole.id }),
    );
    await rbacCacheService.reload();
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
    await grantUsersReadPermission(permittedUser.id);

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
});
