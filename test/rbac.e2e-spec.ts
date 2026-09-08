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
import { cookieHeaderFrom, cookieValue } from './support/auth';

interface AuthResponseBody {
  user: { id: string; email: string };
}

describe('RBAC (e2e)', () => {
  let app: NestFastifyApplication;
  let roleRepository: Repository<Role>;
  let userRoleRepository: Repository<UserRole>;
  let rbacCacheService: RbacCacheService;

  let adminCookie: string;

  const password = 'p@ssw0rd123';
  const uniqueEmail = (label: string) =>
    `e2e-rbac-${label}-${randomUUID()}@example.com`;

  const registerUser = (email: string) =>
    request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);

  const authed = (method: 'get' | 'post' | 'put' | 'delete', url: string) =>
    request(app.getHttpServer())[method](url).set('Cookie', adminCookie);

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

    // Bootstrap the first admin per src/modules/rbac/README.MD: assign the
    // seed-migration `admin` role directly (no self-serve bootstrap endpoint),
    // then reload the cache to mimic the documented restart.
    const admin = await registerUser(uniqueEmail('admin'));
    adminCookie = cookieHeaderFrom(admin);
    const adminBody = admin.body as AuthResponseBody;

    const adminRole = await roleRepository.findOneByOrFail({ name: 'admin' });
    await userRoleRepository.save(
      userRoleRepository.create({
        userId: adminBody.user.id,
        roleId: adminRole.id,
      }),
    );
    await rbacCacheService.reload();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('authentication and authorization', () => {
    it('rejects requests with no access cookie with 401', async () => {
      await request(app.getHttpServer()).get('/admin/rbac/roles').expect(401);
    });

    it('rejects a non-admin user with 403', async () => {
      const plainUser = await registerUser(uniqueEmail('plain'));

      await request(app.getHttpServer())
        .get('/admin/rbac/roles')
        .set('Cookie', cookieHeaderFrom(plainUser))
        .expect(403);
    });

    it('rejects a refresh token used as an access cookie with 401', async () => {
      const plainUser = await registerUser(uniqueEmail('refresh-as-access'));
      const refreshToken = cookieValue(plainUser, 'refresh_token');

      await request(app.getHttpServer())
        .get('/admin/rbac/roles')
        .set('Cookie', `access_token=${refreshToken}`)
        .expect(401);
    });
  });

  describe('roles CRUD', () => {
    it('creates, lists, updates a role and rejects duplicates/unknown ids', async () => {
      const name = `role-${randomUUID()}`;

      const created = await authed('post', '/admin/rbac/roles')
        .send({ name, description: 'test role' })
        .expect(201);
      const role = created.body as Role;
      expect(role.id).toBeDefined();
      expect(role.name).toBe(name);

      await authed('post', '/admin/rbac/roles')
        .send({ name, description: 'duplicate' })
        .expect(409);

      const list = await authed('get', '/admin/rbac/roles').expect(200);
      expect((list.body as Role[]).some((r) => r.id === role.id)).toBe(true);

      const updated = await authed('put', `/admin/rbac/roles/${role.id}`)
        .send({ name: `${name}-renamed` })
        .expect(200);
      expect((updated.body as Role).name).toBe(`${name}-renamed`);

      await authed('put', `/admin/rbac/roles/${randomUUID()}`)
        .send({ name: 'nope' })
        .expect(404);

      await authed('delete', `/admin/rbac/roles/${randomUUID()}`).expect(404);
    });
  });

  describe('permissions CRUD', () => {
    it('creates, lists, updates a permission and rejects duplicates/unknown ids', async () => {
      const name = `perm-${randomUUID()}`;

      const created = await authed('post', '/admin/rbac/permissions')
        .send({ name, actions: ['create', 'read'] })
        .expect(201);
      const permission = created.body as { id: string; name: string };
      expect(permission.id).toBeDefined();

      await authed('post', '/admin/rbac/permissions')
        .send({ name, actions: ['create'] })
        .expect(409);

      const list = await authed('get', '/admin/rbac/permissions').expect(200);
      expect(
        (list.body as { id: string }[]).some((p) => p.id === permission.id),
      ).toBe(true);

      await authed('put', `/admin/rbac/permissions/${permission.id}`)
        .send({ actions: ['create', 'read', 'update'] })
        .expect(200);

      await authed('put', `/admin/rbac/permissions/${randomUUID()}`)
        .send({ actions: ['create'] })
        .expect(404);

      await authed('delete', `/admin/rbac/permissions/${randomUUID()}`).expect(
        404,
      );
    });
  });

  describe('grants CRUD', () => {
    it('validates role/permission existence, uniqueness, and action subsets', async () => {
      const roleRes = await authed('post', '/admin/rbac/roles')
        .send({ name: `grant-role-${randomUUID()}` })
        .expect(201);
      const role = roleRes.body as Role;

      const permissionRes = await authed('post', '/admin/rbac/permissions')
        .send({
          name: `grant-perm-${randomUUID()}`,
          actions: ['create', 'read'],
        })
        .expect(201);
      const permission = permissionRes.body as {
        id: string;
        actions: string[];
      };

      await authed('post', '/admin/rbac/grants')
        .send({ roleId: randomUUID(), permissionId: permission.id })
        .expect(404);

      await authed('post', '/admin/rbac/grants')
        .send({ roleId: role.id, permissionId: randomUUID() })
        .expect(404);

      const grantRes = await authed('post', '/admin/rbac/grants')
        .send({
          roleId: role.id,
          permissionId: permission.id,
          actions: ['create'],
        })
        .expect(201);
      const grant = grantRes.body as { id: string };

      await authed('post', '/admin/rbac/grants')
        .send({ roleId: role.id, permissionId: permission.id })
        .expect(409);

      await authed('put', `/admin/rbac/grants/${grant.id}`)
        .send({ actions: ['not-a-declared-action'] })
        .expect(400);

      await authed('put', `/admin/rbac/grants/${grant.id}`)
        .send({ actions: ['create', 'read'] })
        .expect(200);

      const list = await authed('get', '/admin/rbac/grants').expect(200);
      expect(
        (list.body as { id: string }[]).some((g) => g.id === grant.id),
      ).toBe(true);

      await authed('delete', `/admin/rbac/grants/${grant.id}`).expect(204);
      await authed('delete', `/admin/rbac/grants/${grant.id}`).expect(404);
    });
  });

  describe('user-roles assignment', () => {
    it('validates user/role existence, uniqueness, and supports revoke', async () => {
      const targetUser = (await registerUser(uniqueEmail('target')))
        .body as AuthResponseBody;
      const roleRes = await authed('post', '/admin/rbac/roles')
        .send({ name: `assign-role-${randomUUID()}` })
        .expect(201);
      const role = roleRes.body as Role;

      await authed('post', `/admin/rbac/users/${randomUUID()}/roles`)
        .send({ roleId: role.id })
        .expect(404);

      await authed('post', `/admin/rbac/users/${targetUser.user.id}/roles`)
        .send({ roleId: randomUUID() })
        .expect(404);

      await authed('post', `/admin/rbac/users/${targetUser.user.id}/roles`)
        .send({ roleId: role.id })
        .expect(201);

      await authed('post', `/admin/rbac/users/${targetUser.user.id}/roles`)
        .send({ roleId: role.id })
        .expect(409);

      const rolesList = await authed(
        'get',
        `/admin/rbac/users/${targetUser.user.id}/roles`,
      ).expect(200);
      expect((rolesList.body as Role[]).some((r) => r.id === role.id)).toBe(
        true,
      );

      await authed(
        'delete',
        `/admin/rbac/users/${targetUser.user.id}/roles/${randomUUID()}`,
      ).expect(404);

      await authed(
        'delete',
        `/admin/rbac/users/${targetUser.user.id}/roles/${role.id}`,
      ).expect(204);

      const afterRevoke = await authed(
        'get',
        `/admin/rbac/users/${targetUser.user.id}/roles`,
      ).expect(200);
      expect((afterRevoke.body as Role[]).some((r) => r.id === role.id)).toBe(
        false,
      );
    });
  });

  describe('cascade delete', () => {
    it('cascades role deletion to its grants and user-role assignments', async () => {
      const roleRes = await authed('post', '/admin/rbac/roles')
        .send({ name: `cascade-role-${randomUUID()}` })
        .expect(201);
      const role = roleRes.body as Role;

      const permissionRes = await authed('post', '/admin/rbac/permissions')
        .send({
          name: `cascade-perm-${randomUUID()}`,
          actions: ['create'],
        })
        .expect(201);
      const permission = permissionRes.body as { id: string };

      const grantRes = await authed('post', '/admin/rbac/grants')
        .send({ roleId: role.id, permissionId: permission.id })
        .expect(201);
      const grant = grantRes.body as { id: string };

      const targetUser = (await registerUser(uniqueEmail('cascade-target')))
        .body as AuthResponseBody;
      await authed('post', `/admin/rbac/users/${targetUser.user.id}/roles`)
        .send({ roleId: role.id })
        .expect(201);

      await authed('delete', `/admin/rbac/roles/${role.id}`).expect(204);

      const grants = await authed('get', '/admin/rbac/grants').expect(200);
      expect(
        (grants.body as { id: string }[]).some((g) => g.id === grant.id),
      ).toBe(false);

      const userRoles = await authed(
        'get',
        `/admin/rbac/users/${targetUser.user.id}/roles`,
      ).expect(200);
      expect((userRoles.body as Role[]).some((r) => r.id === role.id)).toBe(
        false,
      );
    });
  });
});
