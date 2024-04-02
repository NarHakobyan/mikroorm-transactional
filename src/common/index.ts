import { EventEmitter } from 'events';

import {
  MIKROORM_DATA_SOURCE_NAME,
  MIKROORM_DATA_SOURCE_NAME_PREFIX,
  MIKROORM_ENTITY_MANAGER_NAME,
  MIKROORM_HOOK_NAME,
} from './constants';
import { StorageDriver } from '../storage/driver/interface';
import { storage } from '../storage';
import { EntityManager, EntityRepository, MikroORM } from '@mikro-orm/core';
import { isDataSource } from "../utils";

export type DataSourceName = string | 'default';

/**
 * Options to adjust and manage this library
 */
interface TypeormTransactionalOptions {
  /**
   * Controls how many hooks (`commit`, `rollback`, `complete`) can be used simultaneously.
   * If you exceed the number of hooks of same type, you get a warning. This is a useful to find possible memory leaks.
   * You can set this options to `0` or `Infinity` to indicate an unlimited number of listeners.
   */
  maxHookHandlers: number;
}

/**
 * Global data and state
 */
interface TypeormTransactionalData {
  options: TypeormTransactionalOptions;
}

interface AddTransactionalDataSourceInput {
  /**
   * Custom name for data source
   */
  name?: DataSourceName;
  dataSource: MikroORM;
  /**
   * Whether to "patch" some `MikroORM` methods to support their usage in transactions (default `true`).
   *
   * If you don't need to use `MikroORM` methods in transactions and you only work with `Repositories`,
   * you can set this flag to `false`.
   */
  patch?: boolean;
}

/**
 * Map of added data sources.
 *
 * The property "name" in the `MikroORM` is deprecated, so we add own names to distinguish data sources.
 */
const dataSources = new Map<DataSourceName, MikroORM>();

/**
 * Default library's state
 */
const data: TypeormTransactionalData = {
  options: {
    maxHookHandlers: 10,
  },
};

export const getTransactionalContext = () => storage.get();

export const getEntityManagerByDataSourceName = (context: StorageDriver, name: DataSourceName) => {
  if (!dataSources.has(name)) return null;

  return (context.get(MIKROORM_DATA_SOURCE_NAME_PREFIX + name) as EntityManager) || null;
};

export const setEntityManagerByDataSourceName = (
  context: StorageDriver,
  name: DataSourceName,
  entityManager: EntityManager | null,
) => {
  if (!dataSources.has(name)) return;

  context.set(MIKROORM_DATA_SOURCE_NAME_PREFIX + name, entityManager);
};

const getEntityManagerInContext = (dataSourceName: DataSourceName) => {
  const context = getTransactionalContext();
  if (!context || !context.active) return null;

  return getEntityManagerByDataSourceName(context, dataSourceName);
};

const patchDataSource = (dataSource: MikroORM) => {
  let originalManager = dataSource.em;

  Object.defineProperty(dataSource, 'em', {
    configurable: true,
    get() {
      return (
        getEntityManagerInContext(this[MIKROORM_DATA_SOURCE_NAME] as DataSourceName) ||
        originalManager
      );
    },
    set(em: EntityManager) {
      originalManager = em;
    },
  });

  // const originalQuery = MikroORM.prototype.query;
  // if (originalQuery.length !== 3) {
  //   throw new MikroOrmUpdatedPatchError();
  // }

  // dataSource.query = function (...args: unknown[]) {
  //   args[2] = args[2] || this.em?.queryRunner;
  //
  //   return originalQuery.apply(this, args);
  // };
  //
  // const originalCreateQueryBuilder = MikroORM.prototype.createQueryBuilder;
  // if (originalCreateQueryBuilder.length !== 3) {
  //   throw new MikroOrmUpdatedPatchError();
  // }
  //
  // dataSource.createQueryBuilder = function (...args: unknown[]) {
  //   if (args.length === 0) {
  //     return originalCreateQueryBuilder.apply(this, [this.em?.queryRunner]);
  //   }
  //
  //   args[2] = args[2] || this.em?.queryRunner;
  //
  //   return originalCreateQueryBuilder.apply(this, args);
  // };
  //
  // dataSource.transaction = function (...args: unknown[]) {
  //   // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  //   // @ts-ignore
  //   return originalManager.transaction(...args);
  // };
};

const setTransactionalOptions = (options?: Partial<TypeormTransactionalOptions>) => {
  data.options = { ...data.options, ...(options || {}) };
};

export const getTransactionalOptions = () => data.options;

export const initializeTransactionalContext = (options?: Partial<TypeormTransactionalOptions>) => {
  setTransactionalOptions(options);

  const patchManager = (repositoryType: unknown) => {
    Object.defineProperty(repositoryType, 'em', {
      configurable: true,
      get() {
        return (
          getEntityManagerInContext(
            this[MIKROORM_ENTITY_MANAGER_NAME].connection[
              MIKROORM_DATA_SOURCE_NAME
            ] as DataSourceName,
          ) || this[MIKROORM_ENTITY_MANAGER_NAME]
        );
      },
      set(em: EntityManager | undefined) {
        this[MIKROORM_ENTITY_MANAGER_NAME] = em;
      },
    });
  };

  const getRepository = (originalFn: (args: any) => any) => {
    return function patchRepository(this: any, ...args: any) {
      const repository = originalFn.apply(this, args);

      if (!(MIKROORM_ENTITY_MANAGER_NAME in repository)) {
        /**
         * Store current manager
         */
        repository[MIKROORM_ENTITY_MANAGER_NAME] = repository.em;
      }

      return repository;
    };
  };

  const originalGetRepository = EntityManager.prototype.getRepository;
  // const originalExtend = EntityRepository.prototype.extend;

  EntityManager.prototype.getRepository = getRepository(originalGetRepository);
  // EntityRepository.prototype.extend = getRepository(originalExtend);

  patchManager(EntityRepository.prototype);

  return storage.create();
};

export const addTransactionalDataSource = (input: AddTransactionalDataSourceInput | MikroORM) => {
  if (isDataSource(input)) {
    input = { name: 'default', dataSource: input, patch: true };
  }

  const { name = 'default', dataSource, patch = true } = input;
  if (dataSources.has(name)) {
    throw new Error(`MikroORM with name "${name}" has already added.`);
  }

  if (patch) {
    patchDataSource(dataSource);
  }

  dataSources.set(name, dataSource);
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  dataSource[MIKROORM_DATA_SOURCE_NAME] = name;

  return input.dataSource;
};

export const getDataSourceByName = (name: DataSourceName) => dataSources.get(name);

export const deleteDataSourceByName = (name: DataSourceName) => dataSources.delete(name);

export const getHookInContext = (context: StorageDriver | undefined) =>
  context?.get(MIKROORM_HOOK_NAME) as EventEmitter | null;

export const setHookInContext = (context: StorageDriver, emitter: EventEmitter | null) =>
  context.set(MIKROORM_HOOK_NAME, emitter);
