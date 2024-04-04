import { PostgreSqlDriver, QueryBuilder } from "@mikro-orm/postgresql";
import { EntityManager, EntityRepository, MikroORM } from "@mikro-orm/core";

export const getCurrentTransactionId = async (
  queryable: (() => QueryBuilder) | EntityManager<PostgreSqlDriver> | MikroORM<PostgreSqlDriver> | EntityRepository<any>,
): Promise<number | null> => {
  let id: string | null;

  if (typeof queryable === 'function') {
    await queryable()
      .from( 'counters')
      .insert({  })
      .execute();

    const result = await queryable()
      .select('pg_current_xact_id_if_assigned() as pg_current_xact_id_if_assigned')
      .getSingleResult();

    id = result?.pg_current_xact_id_if_assigned || null;
  } else {
    const driver = ((<any>queryable).driver || (<any>queryable).em.driver) as PostgreSqlDriver;

    await driver.execute('INSERT INTO "counters" values (default)');

    const result = await driver.execute('SELECT pg_current_xact_id_if_assigned() as pg_current_xact_id_if_assigned');

    id = result[0]?.pg_current_xact_id_if_assigned || null;

  }
  return id ? Number.parseInt(id, 10) : null;
};

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
