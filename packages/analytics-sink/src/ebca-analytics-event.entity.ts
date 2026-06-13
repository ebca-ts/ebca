import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EbcaEventType } from '@ebca/core';
import { EbcaAnalyticsEventPayload } from './ebca-analytics-sink.types';

@Entity('ecs_events')
export class EbcaAnalyticsEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'timestamp' })
  @Index()
  event_timestamp: Date;

  @Column({ type: 'varchar', length: 32 })
  event_type: EbcaEventType;

  @Column({ type: 'varchar', length: 255 })
  entity_name: string;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  entity_id: string;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  component_name: string;

  @Column({ type: 'jsonb' })
  component_payload: EbcaAnalyticsEventPayload;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;
}
