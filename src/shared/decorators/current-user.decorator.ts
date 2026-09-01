import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';

export const extractCurrentUser = (
  ctx: ExecutionContext,
): AuthenticatedUser => {
  const request = ctx.switchToHttp().getRequest<FastifyRequest>();
  return (request as FastifyRequest & { user: AuthenticatedUser }).user;
};

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    return extractCurrentUser(ctx);
  },
);
