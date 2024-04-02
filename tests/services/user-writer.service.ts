import { Injectable } from '@nestjs/common';
import { UserReaderService } from './user-reader.service';

import { User } from '../entities/User.entity';
import { runOnTransactionCommit, runOnTransactionRollback, Transactional } from '../../src';
import { EntityRepository } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";

@Injectable()
export class UserWriterService {
  constructor(
    @InjectRepository(User)
    private readonly repository: EntityRepository<User>,

    private readonly readerService: UserReaderService,
  ) {}

  @Transactional()
  async createUser(name: string, hookHandler?: (isCommitted: boolean) => any): Promise<User> {
    if (hookHandler) {
      runOnTransactionCommit(() => hookHandler(true));
      runOnTransactionRollback(() => hookHandler(false));
    }

    const user = new User(name, 0);
    await this.repository.insert(user);

    return user;
  }

  @Transactional()
  async createUserAndThrow(
    name: string,
    hookHandler?: (isCommitted: boolean) => any,
  ): Promise<User> {
    if (hookHandler) {
      runOnTransactionCommit(() => hookHandler(true));
      runOnTransactionRollback(() => hookHandler(false));
    }

    const user = new User(name, 0);
    await this.repository.insert(user);

    throw new Error('Some error');
  }
}
