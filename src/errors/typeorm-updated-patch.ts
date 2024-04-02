export class MikroOrmUpdatedPatchError extends Error {
  public name = 'MikroOrmUpdatedPatchError';

  constructor() {
    super(
      'It seems that MikroORM was updated. Patching "DataSource" is not safe. If you want to try to use the library, set the "patch" flag in the function "addTransactionalDataSource" to "false".',
    );
  }
}
