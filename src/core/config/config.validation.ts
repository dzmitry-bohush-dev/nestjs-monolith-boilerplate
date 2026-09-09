import Joi from 'joi';

import { Config } from './config.types';

export const configValidationSchema = Joi.object<Config>({
  PORT: Joi.number().port().required(),
  NODE_ENV: Joi.string().valid('development', 'production').required(),

  /**
   * Cookie secret
   */
  COOKIE_SECRET: Joi.string().required(),

  /**
   * Health check options
   */
  HEALTH_CHECK_ENABLED: Joi.boolean().optional().default(false),

  /**
   * Throttler options
   */
  THROTTLE_GLOBAL_TTL: Joi.number().optional().default(10000),
  THROTTLE_GLOBAL_LIMIT: Joi.number().optional().default(10),

  /**
   * PostgreSQL database options
   */
  POSTGRES_HOST: Joi.string().hostname().required(),
  POSTGRES_PORT: Joi.number().port().required(),
  POSTGRES_USER: Joi.string().required(),
  POSTGRES_PASSWORD: Joi.string().required(),
  POSTGRES_DB: Joi.string().required(),
  POSTGRES_SYNCHRONIZE: Joi.boolean().optional().default(false),
  POSTGRES_LOGGING: Joi.boolean().optional().default(false),
  POSTGRES_MIGRATIONS_RUN: Joi.boolean().optional().default(false),

  /**
   * JWT & auth options
   */
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRATION: Joi.string().optional().default('15m'),
  JWT_REFRESH_SECRET: Joi.string()
    .min(32)
    .required()
    .invalid(Joi.ref('JWT_SECRET')),
  JWT_REFRESH_EXPIRATION: Joi.string().optional().default('30d'),
  JWT_ISSUER: Joi.string().optional(),
  JWT_AUDIENCE: Joi.string().optional(),
  BCRYPT_SALT_ROUNDS: Joi.number().optional().default(16),

  /**
   * Cookie options
   */
  COOKIE_DOMAIN: Joi.string().optional(),
  COOKIE_SAME_SITE: Joi.string()
    .valid('lax', 'strict', 'none')
    .optional()
    .default('lax'),
  COOKIE_SECURE: Joi.boolean().when('NODE_ENV', {
    is: 'production',
    then: Joi.boolean().default(true),
    otherwise: Joi.boolean().default(false),
  }),

  /**
   * Mailer options
   */
  MAIL_HOST: Joi.string().optional(),
  MAIL_PORT: Joi.number().port().optional().default(587),
  MAIL_SECURE: Joi.boolean().optional().default(false),
  MAIL_USER: Joi.string().optional(),
  MAIL_PASSWORD: Joi.string().optional(),
  MAIL_FROM: Joi.string().optional().default('no-reply@example.com'),

  /**
   * Login OTP options
   */
  LOGIN_OTP_LENGTH: Joi.number().optional().default(6),
  LOGIN_OTP_TTL_MS: Joi.number().optional().default(600000),
  LOGIN_OTP_MAX_ATTEMPTS: Joi.number().optional().default(5),
  LOGIN_OTP_RESEND_COOLDOWN_MS: Joi.number().optional().default(60000),

  /**
   * Email change OTP options
   */
  EMAIL_CHANGE_OTP_LENGTH: Joi.number().optional().default(6),
  EMAIL_CHANGE_OTP_TTL_MS: Joi.number().optional().default(600000),
  EMAIL_CHANGE_OTP_MAX_ATTEMPTS: Joi.number().optional().default(5),
  EMAIL_CHANGE_OTP_RESEND_COOLDOWN_MS: Joi.number().optional().default(60000),
});
