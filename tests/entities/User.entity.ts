import { Entity, EntityRepositoryType, PrimaryKey, Property } from "@mikro-orm/core";
import { UserRepository } from "../repositories/user.repository";

@Entity({
  tableName: 'users',
  repository: () => UserRepository,
})
export class User {
  [EntityRepositoryType]: UserRepository;
  @PrimaryKey()
  name: string;

  @Property({ type: 'integer' })
  money: number;

  constructor(name: string, money: number) {
    this.name = name;
    this.money = money;
  }
}
