import { AuthResponseDto } from '@/modules/auth/dtos/auth-response.dto';
import { LoginConfirmationPendingDto } from '@/modules/auth/dtos/login-confirmation-pending.dto';

/**
 * Internal result of AuthService.login() — not returned to clients directly.
 * AuthController maps this to a 200 (AUTHENTICATED) or 202 (CONFIRMATION_REQUIRED) response.
 */
export type LoginResultDto =
  | { status: 'AUTHENTICATED'; body: AuthResponseDto }
  | { status: 'CONFIRMATION_REQUIRED'; body: LoginConfirmationPendingDto };
