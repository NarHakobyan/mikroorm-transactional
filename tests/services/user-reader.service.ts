import { Injectable } from '@nestjs/common';

import { Transactional } from '../../src';
import { User } from '../entities/User.entity';
import { InjectRepository } from "@mikro-orm/nestjs";
import { EntityRepository } from "@mikro-orm/core";

@Injectable()
export class UserReaderService {
  constructor(
    @InjectRepository(User)
    private readonly repository: EntityRepository<User>,
  ) {}

  @Transactional()
  async findUserByName(name: string): Promise<User | null> {
    return this.repository.findOne({ name });
  }
}
