import { BaseEntity } from '../bases/base.entity';

/**
 * Тип для конструктора класса, который расширяет `BaseEntity` (наша EBCA сущность).
 */
export type EntityConstructor<T extends BaseEntity> = {
  new (...args: unknown[]): T;
  name: string;
};

/**
 * Интерфейс для опций декоратора @Entity.
 */
export interface EntityOptions {
  name?: string; // Позволяет переопределить имя сущности, если this.constructor.name меняется при минификации.
}
