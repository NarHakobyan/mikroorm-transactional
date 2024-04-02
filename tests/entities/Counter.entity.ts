import { Entity, PrimaryGeneratedColumn } from '@mikro-orm/core';

@Entity('counters')
export class Counter {
  @PrimaryGeneratedColumn()
  value: number;
}
