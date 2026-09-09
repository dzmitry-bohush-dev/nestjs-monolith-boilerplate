import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Not } from 'typeorm';

import { UpdateUserDto } from '@/modules/users/dtos/update-user.dto';
import { User } from '@/modules/users/entities/user.entity';
import { UsersService } from '@/modules/users/services/users.service';

type MockRepository = {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
};

describe('UsersService', () => {
  let service: UsersService;
  let repository: MockRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repository = module.get(getRepositoryToken(User));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByEmail', () => {
    it('returns the user when found', async () => {
      const user = { id: '1', email: 'test@example.com' } as User;
      repository.findOne.mockResolvedValue(user);

      const result = await service.findByEmail('test@example.com');

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com', status: Not('DELETED') },
      });
      expect(result).toBe(user);
    });

    it('returns null when not found', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.findByEmail('missing@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('returns the user when found', async () => {
      const user = { id: '1', email: 'test@example.com' } as User;
      repository.findOne.mockResolvedValue(user);

      const result = await service.findById('1');

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: '1', status: Not('DELETED') },
      });
      expect(result).toBe(user);
    });

    it('returns null when not found', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.findById('missing-id');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates and saves a new user', async () => {
      const created = {
        email: 'test@example.com',
        passwordHash: 'hash',
      } as User;
      const saved = { ...created, id: '1' } as User;
      repository.create.mockReturnValue(created);
      repository.save.mockResolvedValue(saved);

      const result = await service.create('test@example.com', 'hash');

      expect(repository.create).toHaveBeenCalledWith({
        email: 'test@example.com',
        passwordHash: 'hash',
      });
      expect(repository.save).toHaveBeenCalledWith(created);
      expect(result).toBe(saved);
    });
  });

  describe('update', () => {
    const buildUser = (overrides: Partial<User> = {}): User =>
      ({
        id: 'user-1',
        email: 'current@example.com',
        photo: null,
        firstName: null,
        lastName: null,
        ...overrides,
      }) as User;

    it('throws ForbiddenException when a self update includes an email key', async () => {
      const targetUser = buildUser();
      const patch: UpdateUserDto = { email: 'current@example.com' };

      await expect(
        service.update(targetUser, patch, 'self'),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(repository.save).not.toHaveBeenCalled();
    });

    it('throws ConflictException when a permission update sets an email already taken by another user', async () => {
      const targetUser = buildUser();
      const patch: UpdateUserDto = { email: 'taken@example.com' };
      repository.findOne.mockResolvedValue(
        buildUser({ id: 'other-user', email: 'taken@example.com' }),
      );

      await expect(
        service.update(targetUser, patch, 'permission'),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(repository.save).not.toHaveBeenCalled();
    });

    it('updates and saves the user on a permission update with no conflict', async () => {
      const targetUser = buildUser();
      const patch: UpdateUserDto = {
        email: 'new@example.com',
        firstName: 'Jane',
      };
      repository.findOne.mockResolvedValue(null);
      const saved = { ...targetUser, ...patch } as User;
      repository.save.mockResolvedValue(saved);

      const result = await service.update(targetUser, patch, 'permission');

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { email: 'new@example.com', status: Not('DELETED') },
      });
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining(patch),
      );
      expect(result).toBe(saved);
    });

    it('does not check for conflicts and saves as a no-op when email is unchanged', async () => {
      const targetUser = buildUser({ email: 'current@example.com' });
      const patch: UpdateUserDto = { email: 'current@example.com' };
      repository.save.mockResolvedValue(targetUser);

      const result = await service.update(targetUser, patch, 'permission');

      expect(repository.findOne).not.toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalledWith(targetUser);
      expect(result).toBe(targetUser);
    });

    it('does not overwrite fields with explicit undefined values from a class-transformed DTO', async () => {
      // ValidationPipe({ transform: true }) uses class-transformer, which
      // (by default) assigns `undefined` for every DTO field missing from
      // the request body, rather than omitting the key entirely.
      const targetUser = buildUser({
        firstName: 'Existing',
        lastName: 'Name',
      });
      const patch = Object.assign(new UpdateUserDto(), {
        firstName: 'Jane',
      }) as UpdateUserDto;
      repository.save.mockImplementation((user: User) => Promise.resolve(user));

      const result = await service.update(targetUser, patch, 'self');

      expect(result.firstName).toBe('Jane');
      expect(result.lastName).toBe('Name');
      expect(result.email).toBe('current@example.com');
    });
  });
});
