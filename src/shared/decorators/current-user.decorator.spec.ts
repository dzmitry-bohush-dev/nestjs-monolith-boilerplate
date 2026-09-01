import { ExecutionContext } from '@nestjs/common';
import { extractCurrentUser } from './current-user.decorator';
import { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';

describe('CurrentUser Decorator', () => {
  describe('extractCurrentUser', () => {
    it('should extract user from request', () => {
      const mockUser: AuthenticatedUser = {
        userId: 'user-123',
        email: 'test@example.com',
      };

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: mockUser,
          }),
        }),
      } as unknown as ExecutionContext;

      const result = extractCurrentUser(mockContext);

      expect(result).toEqual(mockUser);
    });

    it('should return undefined if user is not present on request', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({}),
        }),
      } as unknown as ExecutionContext;

      const result = extractCurrentUser(mockContext);

      expect(result).toBeUndefined();
    });
  });
});
