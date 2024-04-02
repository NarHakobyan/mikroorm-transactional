import { Entity, PrimaryKey } from "@mikro-orm/core";

@Entity({
  tableName: 'counters',
})
export class Counter {
  @PrimaryKey()
  value: number;
}
