import { Injectable } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { CookieSerializeOptions } from '@fastify/cookie';
import ms from 'ms';
import type { StringValue } from 'ms';

import { ConfigService } from '@/core/config/config.service';

const ACCESS_TOKEN_COOKIE = 'access_token';
const REFRESH_TOKEN_COOKIE = 'refresh_token';
const REFRESH_TOKEN_COOKIE_PATH = '/auth';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthCookieService {
  constructor(private readonly configService: ConfigService) {}

  setAuthCookies(reply: FastifyReply, tokens: TokenPair): void {
    reply.setCookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
      ...this.baseCookieOptions(),
      path: '/',
      maxAge: this.maxAgeSeconds(
        this.configService.get('JWT_ACCESS_EXPIRATION'),
      ),
    });

    reply.setCookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      ...this.baseCookieOptions(),
      path: REFRESH_TOKEN_COOKIE_PATH,
      maxAge: this.maxAgeSeconds(
        this.configService.get('JWT_REFRESH_EXPIRATION'),
      ),
    });
  }

  clearAuthCookies(reply: FastifyReply): void {
    reply.clearCookie(ACCESS_TOKEN_COOKIE, {
      ...this.baseCookieOptions(),
      path: '/',
    });

    reply.clearCookie(REFRESH_TOKEN_COOKIE, {
      ...this.baseCookieOptions(),
      path: REFRESH_TOKEN_COOKIE_PATH,
    });
  }

  private baseCookieOptions(): CookieSerializeOptions {
    return {
      httpOnly: true,
      secure: String(this.configService.get('COOKIE_SECURE')) === 'true',
      sameSite: this.configService.get('COOKIE_SAME_SITE') as
        | 'lax'
        | 'strict'
        | 'none',
      domain: this.configService.get('COOKIE_DOMAIN') || undefined,
      signed: false,
    };
  }

  private maxAgeSeconds(expiration: string): number {
    return Math.floor(ms(expiration as StringValue) / 1000);
  }
}
