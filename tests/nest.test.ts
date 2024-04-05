import { Test, TestingModule } from '@nestjs/testing';

import { User } from './entities/User.entity';
import { UserReaderService } from './services/user-reader.service';
import { UserWriterService } from './services/user-writer.service';

import { initializeTransactionalContext, addTransactionalDataSource } from '../src';
import { MikroORM } from "@mikro-orm/core";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { PostgreSqlDriver } from "@mikro-orm/postgresql";

describe('Integration with Nest.js', () => {
  let app: TestingModule;

  let readerService: UserReaderService;
  let writerService: UserWriterService;

  let dataSource: MikroORM;

  beforeAll(async () => {
    initializeTransactionalContext();

    app = await Test.createTestingModule({
      imports: [
        MikroOrmModule.forRootAsync({
          useFactory() {
            return {
              driver: PostgreSqlDriver,
              host: 'localhost',
              // port: 5436,
              port: 5432,
              user: 'postgres',
              password: 'postgres',
              dbName: 'test',
              allowGlobalContext: true,
              entities: [User],
              synchronize: true,
              logging: false,
            };
          },
        }),
        MikroOrmModule.forFeature([User]),
      ],
      providers: [UserReaderService, UserWriterService],
      exports: [],
    }).compile();

    dataSource = app.get(MikroORM);

    addTransactionalDataSource(dataSource);

    // @ts-ignore
    await dataSource.em.driver.execute(`
CREATE TABLE IF NOT EXISTS counters (
  value SERIAL PRIMARY KEY
                      );`);
    // @ts-ignore
    await dataSource.em.driver.execute(`
      CREATE TABLE IF NOT EXISTS "users" (
                             "name" varchar(255) NOT NULL,
                             "money" int4 NOT NULL,
                             PRIMARY KEY ("name")
      );
    `);

    readerService = app.get<UserReaderService>(UserReaderService);
    writerService = app.get<UserWriterService>(UserWriterService);
  });

  afterEach(async () => {
    dataSource.em.clear();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should create a user using service if transaction was completed successfully', async () => {
    const name = 'John Doe';
    const onTransactionCompleteSpy = jest.fn();

    const writtenPost = await writerService.createUser(name, onTransactionCompleteSpy);
    expect(writtenPost.name).toBe(name);

    const readPost = await readerService.findUserByName(name);
    expect(readPost?.name).toBe(name);

    expect(onTransactionCompleteSpy).toBeCalledTimes(1);
    expect(onTransactionCompleteSpy).toBeCalledWith(true);
  });

  it('should fail to create a user using service if error was thrown', async () => {
    const name = 'John Doe';
    const onTransactionCompleteSpy = jest.fn();

    expect(() =>
      writerService.createUserAndThrow(name, onTransactionCompleteSpy),
    ).rejects.toThrowError();

    const readPost = await readerService.findUserByName(name);
    expect(readPost).toBeNull();

    expect(onTransactionCompleteSpy).toBeCalledTimes(1);
    expect(onTransactionCompleteSpy).toBeCalledWith(false);
  });
});
