export interface JwtPayload {
  sub: string;
  email: string;
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
}
