import 'reflect-metadata';
import { BaseEntity } from '../bases/base.entity'; // Обновленный импорт на BaseEntity

import { EntityConstructor } from '../types/entities';
import { MetadataStorage } from './metadata.storage'; // Импортируем EntityConstructor из нового декоратора

export const PERSISTENT_PROPERTIES_METADATA = Symbol(
  'persistent_properties_metadata',
);

/**
 * Метаданные о персистентном свойстве компонента.
 * Содержит имя свойства компонента, класс сущности, к которой оно относится,
 * и имя свойства в этой сущности.
 */
export class PersistentPropertyMetadata<E extends BaseEntity> {
  constructor(
    public readonly componentProperty: string,
    public readonly entityClass: EntityConstructor<E>, // Используем EntityConstructor из entity.decorator.ts
    public readonly entityProperty: keyof E, // Имя свойства в сущности (например, 'title')
  ) {}
}

/**
 * Декоратор для пометки свойства компонента как персистентного и его маппинга
 * на конкретное свойство сущности TypeORM. Значение этого свойства будет
 * храниться напрямую в колонке базы данных соответствующей сущности.
 *
 * @param EntityClass Класс сущности TypeORM (например, `PlayerEntity`), к которой принадлежит этот компонент.
 *                    Должен быть наследником `BaseEntity`.
 * @param entityProperty Ключ свойства в сущности, куда будет проецироваться значение данного свойства компонента.
 *                       Это свойство сущности должно быть определено вручную с помощью декоратора `@Column` в самой сущности.
 */
export function PersistentProperty<E extends BaseEntity>(
  EntityClass: EntityConstructor<E>,
  entityProperty: keyof E,
) {
  return (target: object, propertyKey: string | symbol) => {
    const properties = MetadataStorage.getMetadata<
      PersistentPropertyMetadata<E>[]
    >(PERSISTENT_PROPERTIES_METADATA, target.constructor, []);

    const newProperty = new PersistentPropertyMetadata(
      propertyKey.toString(),
      EntityClass,
      entityProperty,
    );

    properties.push(newProperty);

    Reflect.defineMetadata(
      PERSISTENT_PROPERTIES_METADATA,
      properties,
      target.constructor,
    );
  };
}
