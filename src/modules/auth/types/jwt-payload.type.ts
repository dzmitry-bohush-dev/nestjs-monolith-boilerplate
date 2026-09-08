export interface JwtPayload {
  sub: string;
  email: string;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
}

interface JwtStandardClaims {
  iat: number;
  exp: number;
  iss?: string;
  aud?: string;
}

export type DecodedAccessTokenPayload = AccessTokenPayload & JwtStandardClaims;
export type DecodedRefreshTokenPayload = RefreshTokenPayload &
  JwtStandardClaims;

export interface AuthenticatedUser {
  userId: string;
  email: string;
}
