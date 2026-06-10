import {
  BaseEntity as TypeOrmBaseEntity,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';
import { BaseComponent } from './base.component';

import { ComponentConstructor } from '../types/componens';

/**
 * Абстрактный базовый класс для всех сущностей в EBCA-архитектуре.
 * Содержит только идентификатор сущности и поле для хранения персистентных компонентов в JSONB.
 */
export abstract class BaseEntity extends TypeOrmBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Поле для хранения JSON-представления всех персистентных компонентов,
   * связанных с этой сущностью, которые не имеют специфических проекций.
   * Выступает как источник правды для компонентов с isPersistent: true,
   * если нет @PersistentProperty для конкретных полей.
   */
  @Column('jsonb', { nullable: false, default: '{}' })
  components: Record<
    ComponentConstructor<BaseComponent>['name'],
    BaseComponent
  >;
}
