import { MikroORM } from '@mikro-orm/core';

export const isDataSource = (value: unknown): value is MikroORM => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return value.constructor.name === MikroORM.name;
};
