import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

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
        where: { email: 'test@example.com' },
      });
      expect(result).toBe(user);
    });

    it('returns null when not found', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.findByEmail('missing@example.com');

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
});
