export interface Config {
  PORT: number;
  NODE_ENV: 'development' | 'production';

  /**
   * Cookie secret
   */
  COOKIE_SECRET: string;

  /**
   * Health check options
   */
  HEALTH_CHECK_ENABLED?: boolean;

  /**
   * Throttler options
   */
  THROTTLE_GLOBAL_TTL?: number;
  THROTTLE_GLOBAL_LIMIT?: number;

  /**
   * PostgreSQL database options
   */
  POSTGRES_HOST: string;
  POSTGRES_PORT: number;
  POSTGRES_USER: string;
  POSTGRES_PASSWORD: string;
  POSTGRES_DB: string;
  POSTGRES_SYNCHRONIZE?: boolean;
  POSTGRES_LOGGING?: boolean;
  POSTGRES_MIGRATIONS_RUN?: boolean;

  /**
   * JWT & auth options
   */
  JWT_SECRET: string;
  JWT_ACCESS_EXPIRATION?: string;
  JWT_REFRESH_SECRET: string;
  JWT_REFRESH_EXPIRATION?: string;
  JWT_ISSUER?: string;
  JWT_AUDIENCE?: string;
  BCRYPT_SALT_ROUNDS?: number;

  /**
   * Cookie options
   */
  COOKIE_DOMAIN?: string;
  COOKIE_SAME_SITE?: 'lax' | 'strict' | 'none';
  COOKIE_SECURE?: boolean;

  /**
   * Mailer options
   */
  MAIL_HOST?: string;
  MAIL_PORT?: number;
  MAIL_SECURE?: boolean;
  MAIL_USER?: string;
  MAIL_PASSWORD?: string;
  MAIL_FROM?: string;

  /**
   * Login OTP options
   */
  LOGIN_OTP_LENGTH?: number;
  LOGIN_OTP_TTL_MS?: number;
  LOGIN_OTP_MAX_ATTEMPTS?: number;
  LOGIN_OTP_RESEND_COOLDOWN_MS?: number;

  /**
   * Email change OTP options
   */
  EMAIL_CHANGE_OTP_LENGTH?: number;
  EMAIL_CHANGE_OTP_TTL_MS?: number;
  EMAIL_CHANGE_OTP_MAX_ATTEMPTS?: number;
  EMAIL_CHANGE_OTP_RESEND_COOLDOWN_MS?: number;
}
