import { BaseEntity, Entity as EbcaEntity } from '@ebca/core';
import { Entity as TypeOrmEntity } from 'typeorm';

@EbcaEntity()
@TypeOrmEntity('counters')
export class CounterEntity extends BaseEntity {
  constructor(id?: string) {
    super();
    if (id) {
      this.id = id;
    }
  }
}
