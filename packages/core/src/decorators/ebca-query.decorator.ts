import 'reflect-metadata';
import { Injectable, Logger } from '@nestjs/common';
import { MetadataStorage } from './metadata.storage';
import { captureDecoratorSourceFile } from './decorator-source-file';
import {
  EbcaQueryMetadata,
  EbcaQueryOptions,
  EbcaQueryParamMetadata,
  EbcaQueryParamOptions,
  EbcaQueryParamsClass,
  EbcaQueryParamType,
  EbcaReadRepositoryClass,
  EbcaReadRepositoryMetadata,
  EbcaReadRepositoryOptions,
} from '../types/queries';

const logger = new Logger('EbcaQueryDecorator');

export const EBCA_READ_REPOSITORY_METADATA_KEY = Symbol(
  'ebca_read_repository_metadata',
);
export const EBCA_QUERY_PARAM_METADATA_KEY = Symbol(
  'ebca_query_param_metadata',
);

const EBCA_READ_REPOSITORIES: EbcaReadRepositoryMetadata[] = [];
const EBCA_QUERIES: EbcaQueryMetadata[] = [];

export function EbcaReadRepository(
  options: EbcaReadRepositoryOptions = {},
): ClassDecorator {
  return (target) => {
    const repositoryClass = target as EbcaReadRepositoryClass;
    const metadata: EbcaReadRepositoryMetadata = {
      repositoryClass,
      options: {
        name: options.name ?? repositoryClass.name,
      },
      sourceFile: captureDecoratorSourceFile(),
    };
    const existing = EBCA_READ_REPOSITORIES.find(
      (item) => item.options.name === metadata.options.name,
    );
    if (existing) {
      throw new Error(
        `Duplicate EBCA read repository name ${metadata.options.name}: ${existing.repositoryClass.name} and ${repositoryClass.name}.`,
      );
    }
    Injectable()(target);
    MetadataStorage.defineMetadata(
      EBCA_READ_REPOSITORY_METADATA_KEY,
      metadata.options,
      target,
    );
    EBCA_READ_REPOSITORIES.push(metadata);
    logger.debug(`Registered EBCA read repository: ${metadata.options.name}.`);
  };
}

export function EbcaQueryParam(
  options: EbcaQueryParamOptions = {},
): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const paramsClass = target.constructor as EbcaQueryParamsClass;
    const propertyName = String(propertyKey);
    const reflectedType = readReflectedParamType(target, propertyKey);
    const type = options.type ?? reflectedType;
    if (!type) {
      throw new Error(
        `${paramsClass.name}.${propertyName} EBCA query param requires a primitive design type or explicit type option.`,
      );
    }
    const metadata = getStoredQueryParams(paramsClass).filter(
      (item) => item.propertyName !== propertyName,
    );
    metadata.push({
      paramsClass,
      propertyName,
      options: {
        type,
        required: options.required ?? options.default === undefined,
        default: options.default,
        min: options.min,
        max: options.max,
        values: options.values,
        array: options.array ?? false,
      },
    });
    MetadataStorage.defineMetadata(
      EBCA_QUERY_PARAM_METADATA_KEY,
      metadata,
      paramsClass,
    );
  };
}

export function EbcaQuery(options: EbcaQueryOptions): MethodDecorator {
  return (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    const repositoryClass = target.constructor as EbcaReadRepositoryClass;
    const methodName = String(propertyKey);
    const existing = EBCA_QUERIES.find(
      (metadata) => metadata.options.name === options.name,
    );
    if (existing) {
      throw new Error(
        `Duplicate EBCA query name ${options.name}: ${existing.repositoryClass.name}.${existing.methodName} and ${repositoryClass.name}.${methodName}.`,
      );
    }
    const paramsClass = readQueryParamsClass(target, propertyKey);
    const metadata: EbcaQueryMetadata = {
      repositoryClass,
      methodName,
      options: {
        name: options.name,
        gates: options.gates ?? [],
        entityClass: options.entityClass,
        components: options.components ?? [],
      },
      paramsClass,
      params: paramsClass ? getStoredQueryParams(paramsClass) : [],
      sourceFile: captureDecoratorSourceFile(),
    };
    EBCA_QUERIES.push(metadata);
    logger.debug(
      `Registered EBCA query: ${repositoryClass.name}.${methodName} as ${options.name}.`,
    );
    return descriptor;
  };
}

export function getEbcaReadRepositories(): EbcaReadRepositoryMetadata[] {
  return EBCA_READ_REPOSITORIES;
}

export function getEbcaQueries(): EbcaQueryMetadata[] {
  return EBCA_QUERIES;
}

export function getEbcaQueriesForRepository(
  repositoryClass: EbcaReadRepositoryClass,
): EbcaQueryMetadata[] {
  return EBCA_QUERIES.filter(
    (metadata) => metadata.repositoryClass === repositoryClass,
  );
}

export function getEbcaQueryParams(
  paramsClass: EbcaQueryParamsClass,
): EbcaQueryParamMetadata[] {
  return getStoredQueryParams(paramsClass);
}

function readQueryParamsClass(
  target: object,
  propertyKey: string | symbol,
): EbcaQueryParamsClass | null {
  const paramTypes = Reflect.getMetadata(
    'design:paramtypes',
    target,
    propertyKey,
  ) as readonly EbcaQueryParamsClass[] | undefined;
  const firstParamType = paramTypes?.at(0);
  if (!firstParamType) {
    return null;
  }
  if (firstParamType === Object) {
    throw new Error(
      `${target.constructor.name}.${String(propertyKey)} EBCA query params must use a decorated contract class.`,
    );
  }
  return firstParamType;
}

function readReflectedParamType(
  target: object,
  propertyKey: string | symbol,
): EbcaQueryParamType | null {
  const reflectedType = Reflect.getMetadata(
    'design:type',
    target,
    propertyKey,
  ) as { readonly name: string } | undefined;
  if (reflectedType === String) {
    return 'string';
  }
  if (reflectedType === Number) {
    return 'number';
  }
  if (reflectedType === Boolean) {
    return 'boolean';
  }
  if (reflectedType === Date) {
    return 'date';
  }
  return null;
}

function getStoredQueryParams(
  paramsClass: EbcaQueryParamsClass,
): EbcaQueryParamMetadata[] {
  return MetadataStorage.getMetadata<EbcaQueryParamMetadata[]>(
    EBCA_QUERY_PARAM_METADATA_KEY,
    paramsClass,
    [],
  );
}
