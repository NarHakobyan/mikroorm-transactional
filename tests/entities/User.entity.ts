import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({
  tableName: 'users',
})
export class User {
  @PrimaryKey()
  name: string;

  @Property({ type: 'integer' })
  money: number;

  constructor(name: string, money: number) {
    this.name = name;
    this.money = money;
  }
}
