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
  JWT_EXPIRES_IN?: string;
  BCRYPT_SALT_ROUNDS?: number;

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
}
