import { wrapInTransaction, WrapInTransactionOptions } from '../transactions/wrap-in-transaction';

export const Transactional = (options?: WrapInTransactionOptions): MethodDecorator => {
  return (_, methodName, descriptor) => {
    const originalMethod = descriptor.value as () => unknown;

    (<any>descriptor).value = wrapInTransaction(originalMethod, { ...options, name: methodName });

    for (const previousMetadataKey of Reflect.getMetadataKeys(originalMethod)) {
      const previousMetadata = Reflect.getMetadata(previousMetadataKey, originalMethod);

      Reflect.defineMetadata(previousMetadataKey, previousMetadata, descriptor.value as object);
    }

    Object.defineProperty(descriptor.value, 'name', {
      value: originalMethod.name,
      writable: false,
    });
  };
};
