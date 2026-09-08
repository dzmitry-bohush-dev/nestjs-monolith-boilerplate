import { AuthResponseDto } from '@/modules/auth/dtos/auth-response.dto';
import { LoginConfirmationPendingDto } from '@/modules/auth/dtos/login-confirmation-pending.dto';
import { TokenPair } from '@/modules/auth/services/auth-cookie.service';

/**
 * Internal result of AuthService.login() — not returned to clients directly.
 * AuthController maps this to a 200 (AUTHENTICATED) or 202 (CONFIRMATION_REQUIRED) response.
 */
export type LoginResultDto =
  | { status: 'AUTHENTICATED'; body: AuthResponseDto; tokens: TokenPair }
  | { status: 'CONFIRMATION_REQUIRED'; body: LoginConfirmationPendingDto };
