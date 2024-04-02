import { User } from '../entities/User.entity';
import { EntityRepository, MikroORM } from "@mikro-orm/core";

export class UserRepository extends EntityRepository<User> {

  async createUser(name: string, money: number = 0): Promise<User> {
    const user = new User(name, money);

    return this.insert(user);
  }

  async findUserByName(name: string): Promise<User | null> {
    return this.findOne({ name });
  }
}
