import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UpdateUserDto } from '@/modules/users/dtos/update-user.dto';
import { User } from '@/modules/users/entities/user.entity';
import type { ProfileAccessType } from '@/modules/users/guards/user-profile-access.guard';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  create(email: string, passwordHash: string): Promise<User> {
    const user = this.usersRepository.create({ email, passwordHash });

    return this.usersRepository.save(user);
  }

  save(user: User): Promise<User> {
    return this.usersRepository.save(user);
  }

  async update(
    targetUser: User,
    patch: UpdateUserDto,
    accessType: ProfileAccessType,
  ): Promise<User> {
    if (accessType === 'self' && patch.email !== undefined) {
      throw new ForbiddenException(
        'Self-service profile updates cannot change email',
      );
    }

    if (patch.email !== undefined && patch.email !== targetUser.email) {
      const existing = await this.findByEmail(patch.email);

      if (existing && existing.id !== targetUser.id) {
        throw new ConflictException('Email already in use');
      }
    }

    Object.assign(targetUser, patch);

    return this.usersRepository.save(targetUser);
  }
}
