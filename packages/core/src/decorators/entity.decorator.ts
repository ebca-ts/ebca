import 'reflect-metadata';
import { BaseEntity } from '../bases/base.entity';
import { Logger } from '@nestjs/common';
import { EntityConstructor, EntityOptions } from '../types/entities';
import { captureDecoratorSourceFile } from './decorator-source-file';

const logger = new Logger('EntityDecorator');

export const ENTITY_METADATA_KEY = Symbol('entity_metadata');

// Глобальный реестр для зарегистрированных сущностей
const REGISTERED_ENTITIES: EntityConstructor<BaseEntity>[] = [];
const ENTITY_SOURCE_FILES = new Map<EntityConstructor<BaseEntity>, string | null>();

/**
 * Декоратор для пометки класса как EBCA-сущности.
 * Автоматически регистрирует сущность для обнаружения ComponentManager.
 *
 * @param options Опции сущности, например, для переопределения имени.
 */
export function Entity(options?: EntityOptions) {
  return <T extends EntityConstructor<BaseEntity>>(target: T) => {
    Reflect.defineMetadata(ENTITY_METADATA_KEY, options, target);
    REGISTERED_ENTITIES.push(target);
    ENTITY_SOURCE_FILES.set(target, captureDecoratorSourceFile());
    logger.debug(
      `Registered entity: ${target.name} (Custom Name: ${options?.name || 'N/A'})`,
    );
  };
}

/**
 * Возвращает список всех автоматически зарегистрированных EBCA-сущностей.
 */
export function getRegisteredEntities(): EntityConstructor<BaseEntity>[] {
  return REGISTERED_ENTITIES;
}

export function getEntitySourceFile<T extends BaseEntity>(
  target: EntityConstructor<T>,
): string | null {
  return ENTITY_SOURCE_FILES.get(target) ?? null;
}

export function getEntityConstructorByName(
  entityName: string,
): EntityConstructor<BaseEntity> {
  const constructor = REGISTERED_ENTITIES.find((entityClass) => {
    if (entityClass.name === entityName) {
      return true;
    }
    const options = getEntityOptions(entityClass);
    return options?.name === entityName;
  });
  if (!constructor) {
    logger.warn(`Entity constructor for ${entityName} is not registered.`);
    throw new Error(`Entity constructor ${entityName} is not registered.`);
  }
  return constructor;
}

/**
 * Возвращает опции сущности, определенные декоратором @Entity.
 * @param target Конструктор класса сущности.
 */
export function getEntityOptions<T extends BaseEntity>(
  target: EntityConstructor<T>,
): EntityOptions | undefined {
  return Reflect.getMetadata(ENTITY_METADATA_KEY, target) as EntityOptions;
}
