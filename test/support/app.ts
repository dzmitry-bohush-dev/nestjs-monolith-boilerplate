import fastifyCookie from '@fastify/cookie';
import { ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { TestingModule } from '@nestjs/testing';

import { ConfigService } from '../../src/core/config/config.service';

/**
 * Boots a Nest e2e test app on the Fastify adapter with `@fastify/cookie`
 * registered, mirroring `src/main.ts`. The app is cookie-based JWT auth
 * (`reply.setCookie`, `request.cookies`), which only exist on Fastify — the
 * default Express test adapter would 500 on every cookie-setting route.
 */
export const initFastifyTestApp = async (
  moduleFixture: TestingModule,
): Promise<NestFastifyApplication> => {
  const app = moduleFixture.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const configService = app.get(ConfigService);
  await app.register(fastifyCookie, {
    secret: configService.get('COOKIE_SECRET'),
  });

  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return app;
};
