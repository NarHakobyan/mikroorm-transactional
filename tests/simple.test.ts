import {
  addTransactionalDataSource,
  initializeTransactionalContext,
  Propagation,
  runInTransaction,
  runOnTransactionCommit,
  runOnTransactionComplete,
  runOnTransactionRollback,
  TransactionalError,
} from '../src';

import { User } from './entities/User.entity';
import { Counter } from './entities/Counter.entity';

import { sleep, getCurrentTransactionId } from './utils';
import { IsolationLevel, MikroORM } from "@mikro-orm/core";
import { PostgreSqlDriver } from "@mikro-orm/postgresql";

describe('Transactional', () => {
  let dataSource: MikroORM<PostgreSqlDriver>;
  initializeTransactionalContext();

  beforeAll(async () => {
    if (dataSource) {
      return;
    }
    dataSource = await MikroORM.init({
      driver: PostgreSqlDriver,
      host: "localhost",
      port: 5435,
      // port: 5432,
      user: "postgres",
      password: "postgres",
      allowGlobalContext: true,
      dbName: "test",
      entities: [User, Counter],
    });

    // @ts-ignore
    await dataSource.em.driver.execute(`
CREATE TABLE IF NOT EXISTS counters (
  value SERIAL PRIMARY KEY
                      );`);
    // @ts-ignore
    await dataSource.em.driver.execute(`
      CREATE TABLE "users" (
                             "name" varchar(255) NOT NULL,
                             "money" int4 NOT NULL,
                             PRIMARY KEY ("name")
      );
    `);

    addTransactionalDataSource(dataSource);

  });

  const sources = [
    {
      name: 'DataSource',
      source: () => dataSource,
    },
    {
      name: 'Repository',
      source: () => dataSource.em.getRepository(User),
    },
    {
      name: 'Entity Manager',
      source: () => dataSource.em,
    },
    {
      name: 'Custom Repository',
      source: () => dataSource.em.getRepository(User),
    },
    {
      name: 'Query Builder',
      source: () => dataSource.em.createQueryBuilder.bind(dataSource.em),
    },
  ];

  describe.each(sources)('$name', ({ source }) => {
    it('supports basic transactions', async () => {
      let transactionIdBefore: number | null = null;

      await runInTransaction(async () => {
        transactionIdBefore = await getCurrentTransactionId(source());
        const transactionIdAfter = await getCurrentTransactionId(source());

        expect(transactionIdBefore).toBeTruthy();
        expect(transactionIdBefore).toBe(transactionIdAfter);
      });

      const transactionIdOutside = await getCurrentTransactionId(source());
      expect(transactionIdOutside).toBe(null);
      expect(transactionIdOutside).not.toBe(transactionIdBefore);
    });

    it('supports nested transactions', async () => {
      await runInTransaction(async () => {
        const transactionIdBefore = await getCurrentTransactionId(source());

        await runInTransaction(async () => {
          const transactionIdAfter = await getCurrentTransactionId(source());
          expect(transactionIdBefore).toBe(transactionIdAfter);
        });
      });

      expect.assertions(1);
    });

    it('supports several concurrent transactions', async () => {
      let transactionA: number | null = null;
      let transactionB: number | null = null;
      let transactionC: number | null = null;

      await Promise.all([
        runInTransaction(async () => {
          transactionA = await getCurrentTransactionId(source());
        }),
        runInTransaction(async () => {
          transactionB = await getCurrentTransactionId(source());
        }),
        runInTransaction(async () => {
          transactionC = await getCurrentTransactionId(source());
        }),
      ]);

      await Promise.all([transactionA, transactionB, transactionC]);

      expect(transactionA).toBeTruthy();
      expect(transactionB).toBeTruthy();
      expect(transactionC).toBeTruthy();

      expect(transactionA).not.toBe(transactionB);
      expect(transactionA).not.toBe(transactionC);
      expect(transactionB).not.toBe(transactionC);
    });
  });

  // We want to check that `save` doesn't create any intermediate transactions
  describe('Repository', () => {
    it('should not create any intermediate transactions', async () => {
      let transactionIdA: number | null = null;
      let transactionIdB: number | null = null;

      const userRepository = dataSource.em.getRepository(User);

      await runInTransaction(async () => {
        transactionIdA = await getCurrentTransactionId(dataSource.em);
        await userRepository.insert(new User('John Doe', 100));
      });

      await runInTransaction(async () => {
        transactionIdB = await getCurrentTransactionId(dataSource.em);
      });

      let transactionDiff = transactionIdB! - transactionIdA!;
      expect(transactionDiff).toBe(1);
    });
  });

  // describe('Query Builder', () => {
  //   it('should not create any intermediate transactions', async () => {
  //     let transactionIdA: number | null = null;
  //     let transactionIdB: number | null = null;

  //     const qb = dataSource.createQueryBuilder();

  //     await runInTransaction(async () => {
  //       transactionIdA = await getCurrentTransactionId(dataSource);
  //       await qb.insert().into(User).values({ name: 'John Doe', money: 100 }).execute();
  //     });

  //     await runInTransaction(async () => {
  //       transactionIdB = await getCurrentTransactionId(dataSource);
  //     });

  //     let transactionDiff = transactionIdB! - transactionIdA!;
  //     expect(transactionDiff).toBe(1);
  //   });
  // });

  // describe('Entity Manager', () => {
  //   it('should not create any intermediate transactions', async () => {
  //     let transactionIdA: number | null = null;
  //     let transactionIdB: number | null = null;

  //     await runInTransaction(async () => {
  //       transactionIdA = await getCurrentTransactionId(dataSource);
  //       await dataSource.em.save(new User('John Doe', 100));
  //     });

  //     await runInTransaction(async () => {
  //       transactionIdB = await getCurrentTransactionId(dataSource);
  //     });

  //     let transactionDiff = transactionIdB! - transactionIdA!;
  //     expect(transactionDiff).toBe(1);
  //   });
  // });


  // Focus more on the repository, since it's the most common use case
  it('supports basic transactions', async () => {
    const userRepository = dataSource.em.getRepository(User);

    let transactionIdBefore: number | null = null;
    await runInTransaction(async () => {
      transactionIdBefore = await getCurrentTransactionId(dataSource.em);
      await userRepository.createUser('John Doe');
      const transactionIdAfter = await getCurrentTransactionId(dataSource.em);

      expect(transactionIdBefore).toBeTruthy();
      expect(transactionIdBefore).toBe(transactionIdAfter);
    });

    const transactionIdOutside = await getCurrentTransactionId(dataSource.em);
    expect(transactionIdOutside).toBe(null);
    expect(transactionIdOutside).not.toBe(transactionIdBefore);

    const user = await userRepository.findUserByName('John Doe');
    expect(user).toBeDefined();
  });

  it('should rollback the transaction if an error is thrown', async () => {
    const userRepository = dataSource.em.getRepository(User);

    try {
      await runInTransaction(async () => {
        await userRepository.createUser('John Doe');

        throw new Error('Rollback transaction');
      });
    } catch {}

    const user = await userRepository.findUserByName('John Doe');
    expect(user).toBe(null);
  });

  it('supports nested transactions', async () => {
    const userRepository = dataSource.em.getRepository(User);

    await runInTransaction(async () => {
      const transactionIdBefore = await getCurrentTransactionId(dataSource.em);
      await userRepository.createUser('John Doe');

      await runInTransaction(async () => {
        const transactionIdAfter = await getCurrentTransactionId(dataSource.em);
        expect(transactionIdBefore).toBe(transactionIdAfter);
      });
    });

    expect.assertions(1);
  });

  it('supports several concurrent transactions', async () => {
    const userRepository = dataSource.em.getRepository(User);

    let transactionA: number | null = null;
    let transactionB: number | null = null;
    let transactionC: number | null = null;

    await Promise.all([
      runInTransaction(async () => {
        userRepository.createUser('John Doe');

        transactionA = await getCurrentTransactionId(dataSource.em);
      }),
      runInTransaction(async () => {
        userRepository.createUser('Bob Smith');

        transactionB = await getCurrentTransactionId(dataSource.em);
      }),
      runInTransaction(async () => {
        userRepository.createUser('Alice Watson');

        transactionC = await getCurrentTransactionId(dataSource.em);
      }),
    ]);

    await Promise.all([transactionA, transactionB, transactionC]);

    expect(transactionA).toBeTruthy();
    expect(transactionB).toBeTruthy();
    expect(transactionC).toBeTruthy();

    expect(transactionA).not.toBe(transactionB);
    expect(transactionA).not.toBe(transactionC);
    expect(transactionB).not.toBe(transactionC);
  });

  it("doesn't leak variables to outer scope", async () => {
    let transactionSetup = false;
    let transactionEnded = false;

    const userRepository = dataSource.em.getRepository(User);

    let transactionIdOutside: number | null = null;

    const transaction = runInTransaction(async () => {
      transactionSetup = true;

      await sleep(500);

      const transactionIdInside = await getCurrentTransactionId(dataSource.em);

      expect(transactionIdInside).toBeTruthy();
      expect(transactionIdOutside).toBe(null);
      expect(transactionIdInside).not.toBe(transactionIdOutside);

      transactionEnded = true;
    });

    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (transactionSetup) {
          clearInterval(interval);

          resolve();
        }
      }, 200);
    });

    expect(transactionEnded).toBe(false);
    transactionIdOutside = await getCurrentTransactionId(dataSource.em);
    expect(transactionIdOutside).toBe(null);

    expect(transactionEnded).toBe(false);

    await transaction;
  });


  it('should support "REQUIRED" propagation', async () => {
    const userRepository = dataSource.em.getRepository(User);

    await runInTransaction(async () => {
      const transactionId = await getCurrentTransactionId(dataSource.em);
      await userRepository.createUser('John Doe');

      await runInTransaction(
        async () => {
          await userRepository.createUser('Bob Smith');
          const transactionIdNested = await getCurrentTransactionId(dataSource.em);

          // We expect the nested transaction to be under the same transaction
          expect(transactionId).toBe(transactionIdNested);
        },
        { propagation: Propagation.REQUIRED },
      );
    });
  });

  it('should support "SUPPORTS" propagation if active transaction exists', async () => {
    const userRepository = dataSource.em.getRepository(User);

    await runInTransaction(async () => {
      const transactionId = await getCurrentTransactionId(dataSource.em);
      await userRepository.createUser('John Doe');

      await runInTransaction(
        async () => {
          await userRepository.createUser('Bob Smith');
          const transactionIdNested = await getCurrentTransactionId(dataSource.em);

          // We expect the nested transaction to be under the same transaction
          expect(transactionId).toBe(transactionIdNested);
        },
        { propagation: Propagation.SUPPORTS },
      );
    });
  });

  it('should support "SUPPORTS" propagation if active transaction doesn\'t exist', async () => {
    const userRepository = dataSource.em.getRepository(User);

    await runInTransaction(
      async () => {
        const transactionId = await getCurrentTransactionId(dataSource.em);

        // We expect the code to be executed without a transaction
        expect(transactionId).toBe(null);
      },
      { propagation: Propagation.SUPPORTS },
    );
  });

  it('should support "MANDATORY" propagation if active transaction exists', async () => {
    const userRepository = dataSource.em.getRepository(User);

    await runInTransaction(async () => {
      const transactionId = await getCurrentTransactionId(dataSource.em);

      await runInTransaction(
        async () => {
          const transactionIdNested = await getCurrentTransactionId(dataSource.em);

          // We expect the nested transaction to be under the same transaction
          expect(transactionId).toBe(transactionIdNested);
        },
        { propagation: Propagation.MANDATORY },
      );
    });
  });

  it('should throw an error if "MANDATORY" propagation is used without an active transaction', async () => {
    const userRepository = dataSource.em.getRepository(User);

    await expect(
      runInTransaction(() => userRepository.findAll(), { propagation: Propagation.MANDATORY }),
    ).rejects.toThrowError(TransactionalError);
  });

  it('should support "REQUIRES_NEW" propagation', async () => {
    const userRepository = dataSource.em.getRepository(User);

    await runInTransaction(async () => {
      const transactionId = await getCurrentTransactionId(dataSource.em);

      await runInTransaction(
        async () => {
          const transactionIdNested = await getCurrentTransactionId(dataSource.em);

          // We expect the nested transaction to be under a different transaction
          expect(transactionId).not.toBe(transactionIdNested);
        },
        { propagation: Propagation.REQUIRES_NEW },
      );

      const transactionIdAfter = await getCurrentTransactionId(dataSource.em);
      // We expect then the transaction to be the same as before
      expect(transactionId).toBe(transactionIdAfter);
    });
  });

  it('should support "NOT_SUPPORTED" propagation', async () => {
    const userRepository = dataSource.em.getRepository(User);

    await runInTransaction(async () => {
      const transactionId = await getCurrentTransactionId(dataSource.em);

      await runInTransaction(
        async () => {
          const transactionIdNested = await getCurrentTransactionId(dataSource.em);

          // We expect the code to be executed without a transaction
          expect(transactionIdNested).toBe(null);
        },
        { propagation: Propagation.NOT_SUPPORTED },
      );

      const transactionIdAfter = await getCurrentTransactionId(dataSource.em);
      // We expect then the transaction to be the same as before
      expect(transactionId).toBe(transactionIdAfter);
    });
  });

  it('should support "NEVER" propagation if active transaction doesn\'t exist', async () => {
    const userRepository = dataSource.em.getRepository(User);

    await runInTransaction(
      async () => {
        const transactionId = await getCurrentTransactionId(dataSource.em);

        // We expect the code to be executed without a transaction
        expect(transactionId).toBe(null);
      },
      { propagation: Propagation.NEVER },
    );
  });

  it('should throw an error if "NEVER" propagation is used with an active transaction', async () => {
    const userRepository = dataSource.em.getRepository(User);

    await runInTransaction(async () => {
      expect(() =>
        runInTransaction(() => userRepository.findAll(), { propagation: Propagation.NEVER }),
      ).rejects.toThrowError(TransactionalError);
    });
  });


  it('should run "runOnTransactionCommit" hook', async () => {
    const userRepository = dataSource.em.getRepository(User);
    const commitSpy = jest.fn();
    const rollbackSpy = jest.fn();
    const completeSpy = jest.fn();

    await runInTransaction(async () => {
      await userRepository.createUser('John Doe');

      runOnTransactionCommit(commitSpy);
    });

    await sleep(1);

    expect(commitSpy).toHaveBeenCalledTimes(1);
    expect(rollbackSpy).not.toHaveBeenCalled();
    expect(completeSpy).not.toHaveBeenCalled();
  });

  it('should run "runOnTransactionRollback" hook', async () => {
    const userRepository = dataSource.em.getRepository(User);
    const commitSpy = jest.fn();
    const rollbackSpy = jest.fn();
    const completeSpy = jest.fn();

    try {
      await runInTransaction(async () => {
        runOnTransactionRollback(rollbackSpy);

        await userRepository.createUser('John Doe');

        throw new Error('Rollback transaction');
      });
    } catch {}

    await sleep(1);

    expect(rollbackSpy).toHaveBeenCalledTimes(1);
    expect(commitSpy).not.toHaveBeenCalled();
    expect(completeSpy).not.toHaveBeenCalled();
  });

  it('should run "runOnTransactionComplete" hook', async () => {
    const userRepository = dataSource.em.getRepository(User);
    const commitSpy = jest.fn();
    const rollbackSpy = jest.fn();
    const completeSpy = jest.fn();

    await runInTransaction(async () => {
      await userRepository.createUser('John Doe');

      runOnTransactionComplete(completeSpy);
    });

    await sleep(1);

    expect(commitSpy).not.toHaveBeenCalled();
    expect(rollbackSpy).not.toHaveBeenCalled();
    expect(completeSpy).toHaveBeenCalledTimes(1);
  });


  it('should read the most recent committed rows when using READ COMMITTED isolation level', async () => {
    await runInTransaction(
      async () => {
        const userRepository = dataSource.em.getRepository(User);
        const totalUsers = await userRepository.count();
        expect(totalUsers).toBe(0);

        // Outside of the transaction
        await dataSource.em.transactional(async (manager) => {
          await manager.insert(new User('John Doe', 100));
        });

        const totalUsers2 = await userRepository.count();
        expect(totalUsers2).toBe(1);
      },
      { isolationLevel: IsolationLevel.READ_COMMITTED },
    );
  });

  it("shouldn't see the most recent committed rows when using REPEATABLE READ isolation level", async () => {
    await runInTransaction(
      async () => {
        const userRepository = dataSource.em.getRepository(User);
        const totalUsers = await userRepository.count();
        expect(totalUsers).toBe(0);

        // Outside of the transaction
        await dataSource.em.transactional(async (manager) => {
          await manager.insert(new User('John Doe', 100));
        });

        const totalUsers2 = await userRepository.count();
        expect(totalUsers2).toBe(0);
      },
      { isolationLevel: IsolationLevel.REPEATABLE_READ },
    );
  });

});
