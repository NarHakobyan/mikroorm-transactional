import { PostgreSqlDriver, QueryBuilder } from "@mikro-orm/postgresql";
import { EntityManager, EntityRepository, MikroORM } from "@mikro-orm/core";

export const getCurrentTransactionId = async (
  queryable: (() => QueryBuilder<any>) | EntityManager<PostgreSqlDriver>,
): Promise<number | null> => {
  let id: string | null;

  if (typeof queryable === 'function') {
    const qb = queryable();

    await qb
      .from( 'counters')
      .insert({ value: () => 'DEFAULT' })
      .execute();

    const result = await qb
      .select('txid_current_if_assigned() as txid_current_if_assigned')
      .from( 'counters')
      .getSingleResult();

    id = result?.txid_current_if_assigned || null;
  } else {

    // @ts-ignore
    await queryable.driver.execute('INSERT INTO "counters" values (default)');

    // @ts-ignore
    const result = await queryable.driver.execute('SELECT txid_current_if_assigned()');
    id = result[0]?.txid_current_if_assigned || null;
  }

  return id ? Number.parseInt(id, 10) : null;
};

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
